import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/pixel-configs — list user's pixel configs
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT * FROM pixel_configs WHERE user_id = $1 ORDER BY funnel_page ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pixel configs:', err);
    res.status(500).json({ error: 'Failed to fetch pixel configs' });
  }
});

// POST /api/pixel-configs — create or update
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, funnel_page, pixel_type, enabled, track_pageviews, track_conversions, track_upsells, custom_code } = req.body;

    if (!funnel_page || !name) {
      res.status(400).json({ error: 'name and funnel_page are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO pixel_configs (user_id, name, funnel_page, pixel_type, enabled, track_pageviews, track_conversions, track_upsells, custom_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id, funnel_page) DO UPDATE SET
         name = EXCLUDED.name,
         pixel_type = EXCLUDED.pixel_type,
         enabled = EXCLUDED.enabled,
         track_pageviews = EXCLUDED.track_pageviews,
         track_conversions = EXCLUDED.track_conversions,
         track_upsells = EXCLUDED.track_upsells,
         custom_code = EXCLUDED.custom_code,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        name,
        funnel_page,
        pixel_type || 'javascript',
        enabled !== false,
        track_pageviews !== false,
        track_conversions !== false,
        track_upsells || false,
        custom_code || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving pixel config:', err);
    res.status(500).json({ error: 'Failed to save pixel config' });
  }
});

// DELETE /api/pixel-configs/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM pixel_configs WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Pixel config not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting pixel config:', err);
    res.status(500).json({ error: 'Failed to delete pixel config' });
  }
});

// GET /api/pixel-configs/snippet/:funnelPage — generate per-page snippet
router.get('/snippet/:funnelPage', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { funnelPage } = req.params;

    const result = await pool.query(
      'SELECT * FROM pixel_configs WHERE user_id = $1 AND funnel_page = $2 AND enabled = true',
      [userId, funnelPage]
    );

    if (result.rows.length === 0) {
      res.json({ snippet: '<!-- No pixel configured for this page -->' });
      return;
    }

    const config = result.rows[0];
    const domain = req.headers.origin || req.headers.host || 'https://yourdomain.com';

    let snippet: string;
    if (config.pixel_type === 'image') {
      snippet = `<!-- OpticData Pixel — ${funnelPage} -->
<noscript>
  <img src="${domain}/api/tracking/pixel.gif?t=pageview&page=${funnelPage}&r=\${encodeURIComponent(document.referrer)}&u=\${encodeURIComponent(location.href)}" width="1" height="1" alt="" style="display:none" />
</noscript>
<!-- End OpticData Pixel -->`;
    } else {
      const events: string[] = [];
      if (config.track_pageviews) events.push("'pageview'");
      if (config.track_conversions) events.push("'conversion'");
      if (config.track_upsells) events.push("'upsell'");

      snippet = `<!-- OpticData Pixel — ${funnelPage} -->
<script>
(function(o,d,t){
  o._odt=o._odt||[];
  var s=d.createElement('script');
  s.async=true;
  s.src=t+'/tracking/pixel.js';
  d.head.appendChild(s);
  o._odt.push(['init',{
    domain:'${domain}',
    page:'${funnelPage}',
    events:[${events.join(',')}]
  }]);
})(window,document,'${domain}');
</script>
<!-- End OpticData Pixel -->`;
    }

    if (config.custom_code) {
      snippet += `\n${config.custom_code}`;
    }

    res.json({ snippet });
  } catch (err) {
    console.error('Error generating pixel snippet:', err);
    res.status(500).json({ error: 'Failed to generate snippet' });
  }
});

export default router;
