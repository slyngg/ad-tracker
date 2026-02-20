import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/generated', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT id, title, report_type, generated_by, created_at, updated_at FROM generated_reports WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.get('/generated/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM generated_reports WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching report:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { type, config } = req.body;
    const reportType = type || 'performance';

    // Gather data for report
    const [metricsResult, pnlResult] = await Promise.all([
      pool.query(`SELECT account_name, SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions FROM fb_ads_today WHERE user_id = $1 GROUP BY account_name`, [userId]),
      pool.query(`SELECT COALESCE(SUM(spend),0) AS spend FROM fb_ads_today WHERE user_id = $1`, [userId]),
    ]);

    // Generate markdown report
    const title = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report - ${new Date().toLocaleDateString()}`;
    const dataSnapshot = { metrics: metricsResult.rows, config };

    let content = `# ${title}\n\n`;
    content += `**Generated:** ${new Date().toISOString()}\n\n`;
    content += `## Summary\n\n`;

    if (metricsResult.rows.length) {
      content += `| Account | Spend | Clicks | Impressions |\n|---------|-------|--------|-------------|\n`;
      for (const row of metricsResult.rows) {
        content += `| ${row.account_name} | $${parseFloat(row.spend).toFixed(2)} | ${row.clicks} | ${row.impressions} |\n`;
      }
    } else {
      content += `No data available for this period.\n`;
    }

    content += `\n## Recommendations\n\n`;
    content += `- Review campaign performance and optimize underperforming ad sets\n`;
    content += `- Consider increasing budget on high-ROAS campaigns\n`;
    content += `- Monitor new customer acquisition costs\n`;

    const result = await pool.query(
      'INSERT INTO generated_reports (user_id, title, report_type, content, data_snapshot) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, title, reportType, content, JSON.stringify(dataSnapshot)]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).json({ error: 'Failed to generate' });
  }
});

router.delete('/generated/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM generated_reports WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
