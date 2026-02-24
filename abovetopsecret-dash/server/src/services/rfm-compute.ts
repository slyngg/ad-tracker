import pool from '../db';

const PRESET_SEGMENTS = [
  { name: 'Whales', label: 'High-value repeat buyers with big baskets', color: '#8b5cf6', recency_max: 60, frequency_min: 5, monetary_min: 500 },
  { name: 'Loyal', label: 'Frequent buyers who keep coming back', color: '#3b82f6', recency_max: 90, frequency_min: 3, monetary_min: 200 },
  { name: 'Core', label: 'Solid customers with moderate activity', color: '#10b981', recency_max: 120, frequency_min: 2, monetary_min: 100 },
  { name: 'Rookies', label: 'New customers with one or two orders', color: '#eab308', recency_max: 60, frequency_max: 2, monetary_max: 200 },
  { name: 'Lapsed', label: 'Previously active but slowing down', color: '#f97316', recency_min: 90, recency_max: 180, frequency_min: 2 },
  { name: 'Lost', label: 'Haven\'t purchased in a long time', color: '#ef4444', recency_min: 180 },
];

export async function ensurePresetSegments(userId: number): Promise<void> {
  for (const seg of PRESET_SEGMENTS) {
    await pool.query(`
      INSERT INTO rfm_segments (user_id, segment_name, segment_label, recency_min, recency_max, frequency_min, frequency_max, monetary_min, monetary_max, color, is_preset)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      ON CONFLICT DO NOTHING
    `, [userId, seg.name, seg.label, seg.recency_min || null, seg.recency_max || null, seg.frequency_min || null, seg.frequency_max || null, seg.monetary_min || null, seg.monetary_max || null, seg.color]);
  }
}

export async function computeRFMScores(userId: number): Promise<{ computed: number }> {
  await ensurePresetSegments(userId);

  // Compute per-customer RFM from orders
  const uf = userId ? 'AND user_id = $1' : '';
  const params = userId ? [userId] : [];

  const customersResult = await pool.query(`
    WITH all_orders AS (
      SELECT customer_email, customer_name, COALESCE(subtotal, revenue) AS revenue, conversion_time AS created_at, user_id
      FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${uf}
      UNION ALL
      SELECT order_data->>'customer_email', order_data->>'customer_name',
             (order_data->>'revenue')::NUMERIC, (order_data->>'created_at')::TIMESTAMPTZ, user_id
      FROM orders_archive WHERE 1=1 ${uf}
    )
    SELECT
      customer_email,
      MAX(customer_name) AS customer_name,
      EXTRACT(DAY FROM NOW() - MAX(created_at))::INTEGER AS recency_days,
      COUNT(*)::INTEGER AS frequency,
      SUM(revenue) AS monetary,
      MIN(created_at::date) AS first_order_date,
      MAX(created_at::date) AS last_order_date
    FROM all_orders
    WHERE customer_email IS NOT NULL AND customer_email != ''
    GROUP BY customer_email
  `, params);

  // Get segments for matching
  const segments = await pool.query('SELECT * FROM rfm_segments WHERE user_id = $1 ORDER BY id', [userId]);

  let computed = 0;
  for (const customer of customersResult.rows) {
    // Find best matching segment
    let matchedSegment: number | null = null;
    for (const seg of segments.rows) {
      const rMatch = (!seg.recency_min || customer.recency_days >= seg.recency_min) && (!seg.recency_max || customer.recency_days <= seg.recency_max);
      const fMatch = (!seg.frequency_min || customer.frequency >= seg.frequency_min) && (!seg.frequency_max || customer.frequency <= seg.frequency_max);
      const mMatch = (!seg.monetary_min || parseFloat(customer.monetary) >= parseFloat(seg.monetary_min)) && (!seg.monetary_max || parseFloat(customer.monetary) <= parseFloat(seg.monetary_max));
      if (rMatch && fMatch && mMatch) { matchedSegment = seg.id; break; }
    }

    // Compute RFM score (1-5 scale)
    const rScore = customer.recency_days <= 30 ? 5 : customer.recency_days <= 60 ? 4 : customer.recency_days <= 90 ? 3 : customer.recency_days <= 180 ? 2 : 1;
    const fScore = customer.frequency >= 10 ? 5 : customer.frequency >= 5 ? 4 : customer.frequency >= 3 ? 3 : customer.frequency >= 2 ? 2 : 1;
    const mScore = parseFloat(customer.monetary) >= 1000 ? 5 : parseFloat(customer.monetary) >= 500 ? 4 : parseFloat(customer.monetary) >= 200 ? 3 : parseFloat(customer.monetary) >= 50 ? 2 : 1;

    await pool.query(`
      INSERT INTO customer_rfm (user_id, customer_email, customer_name, recency_days, frequency, monetary, rfm_score, segment_id, first_order_date, last_order_date, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (user_id, customer_email) DO UPDATE SET
        customer_name = EXCLUDED.customer_name, recency_days = EXCLUDED.recency_days,
        frequency = EXCLUDED.frequency, monetary = EXCLUDED.monetary, rfm_score = EXCLUDED.rfm_score,
        segment_id = EXCLUDED.segment_id, first_order_date = EXCLUDED.first_order_date,
        last_order_date = EXCLUDED.last_order_date, computed_at = NOW()
    `, [userId, customer.customer_email, customer.customer_name, customer.recency_days, customer.frequency, customer.monetary, `${rScore}${fScore}${mScore}`, matchedSegment, customer.first_order_date, customer.last_order_date]);
    computed++;
  }

  // Update segment counts
  await pool.query(`
    UPDATE rfm_segments s SET
      customer_count = (SELECT COUNT(*) FROM customer_rfm WHERE segment_id = s.id),
      total_revenue = (SELECT COALESCE(SUM(monetary), 0) FROM customer_rfm WHERE segment_id = s.id),
      avg_order_value = (SELECT COALESCE(AVG(monetary / GREATEST(frequency, 1)), 0) FROM customer_rfm WHERE segment_id = s.id),
      updated_at = NOW()
    WHERE s.user_id = $1
  `, [userId]);

  return { computed };
}
