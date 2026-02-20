import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// CSV column templates for each upload type
const CSV_TEMPLATES: Record<string, { columns: string[]; description: string }> = {
  orders: {
    columns: [
      'order_id', 'offer_name', 'revenue', 'subtotal', 'order_status',
      'utm_campaign', 'utm_source', 'utm_medium', 'new_customer',
      'quantity', 'subscription_id', 'customer_email', 'order_date',
    ],
    description: 'Order data from checkout platform. order_id and revenue are required.',
  },
  ad_spend: {
    columns: [
      'account_name', 'campaign_name', 'ad_set_name', 'ad_name',
      'spend', 'impressions', 'clicks', 'landing_page_views', 'date',
    ],
    description: 'Ad spend data from advertising platform. account_name and spend are required.',
  },
};

// POST /api/upload/csv - Parse and insert CSV data
router.post('/csv', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { type, headers, rows } = req.body;

    if (!type || !headers || !rows) {
      res.status(400).json({ error: 'type, headers, and rows are required' });
      return;
    }

    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      res.status(400).json({ error: 'headers and rows must be arrays' });
      return;
    }

    if (rows.length === 0) {
      res.status(400).json({ error: 'No rows to import' });
      return;
    }

    const template = CSV_TEMPLATES[type];
    if (!template) {
      res.status(400).json({ error: `Invalid type. Supported types: ${Object.keys(CSV_TEMPLATES).join(', ')}` });
      return;
    }

    let insertedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (type === 'orders') {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length !== headers.length) {
            errors.push(`Row ${i + 1}: column count mismatch`);
            skippedCount++;
            continue;
          }

          const data: Record<string, any> = {};
          headers.forEach((h: string, idx: number) => { data[h] = row[idx]; });

          if (!data.order_id || !data.revenue) {
            errors.push(`Row ${i + 1}: order_id and revenue are required`);
            skippedCount++;
            continue;
          }

          try {
            await client.query(
              `INSERT INTO cc_orders_today (
                order_id, offer_name, revenue, subtotal, order_status,
                utm_campaign, utm_source, utm_medium, new_customer,
                quantity, subscription_id, customer_email, user_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              ON CONFLICT (order_id) DO NOTHING`,
              [
                data.order_id,
                data.offer_name || 'Unknown',
                parseFloat(data.revenue) || 0,
                data.subtotal ? parseFloat(data.subtotal) : null,
                data.order_status || 'completed',
                data.utm_campaign || null,
                data.utm_source || null,
                data.utm_medium || null,
                data.new_customer === 'true' || data.new_customer === '1' || data.new_customer === true,
                data.quantity ? parseInt(data.quantity) : 1,
                data.subscription_id || null,
                data.customer_email || null,
                userId,
              ]
            );
            insertedCount++;
          } catch (rowErr: any) {
            errors.push(`Row ${i + 1}: ${rowErr.message}`);
            skippedCount++;
          }
        }
      } else if (type === 'ad_spend') {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length !== headers.length) {
            errors.push(`Row ${i + 1}: column count mismatch`);
            skippedCount++;
            continue;
          }

          const data: Record<string, any> = {};
          headers.forEach((h: string, idx: number) => { data[h] = row[idx]; });

          if (!data.account_name || !data.spend) {
            errors.push(`Row ${i + 1}: account_name and spend are required`);
            skippedCount++;
            continue;
          }

          try {
            await client.query(
              `INSERT INTO fb_ads_today (
                account_name, campaign_name, ad_set_name, ad_name,
                spend, impressions, clicks, landing_page_views, user_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                data.account_name,
                data.campaign_name || 'Unknown',
                data.ad_set_name || 'Unknown',
                data.ad_name || 'Unknown',
                parseFloat(data.spend) || 0,
                data.impressions ? parseInt(data.impressions) : 0,
                data.clicks ? parseInt(data.clicks) : 0,
                data.landing_page_views ? parseInt(data.landing_page_views) : 0,
                userId,
              ]
            );
            insertedCount++;
          } catch (rowErr: any) {
            errors.push(`Row ${i + 1}: ${rowErr.message}`);
            skippedCount++;
          }
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      inserted: insertedCount,
      skipped: skippedCount,
      total: rows.length,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error('Error uploading CSV:', err);
    res.status(500).json({ error: 'Failed to upload CSV data' });
  }
});

// GET /api/upload/templates - Return CSV column templates
router.get('/templates', (_req: Request, res: Response) => {
  res.json(CSV_TEMPLATES);
});

export default router;
