import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM generated_creatives WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching generated creatives:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { creative_type, platform, brief, inspiration_ad_id, use_brand_vault } = req.body;

    // Load brand vault if requested
    let brandContext = '';
    if (use_brand_vault) {
      const vault = await pool.query('SELECT asset_type, asset_key, asset_value FROM brand_vault WHERE user_id = $1', [userId]);
      brandContext = vault.rows.map(r => `${r.asset_type}: ${r.asset_value}`).join('\n');
    }

    // Generate variations (template-based for now — can be enhanced with Anthropic API)
    const variations = [];
    const types = creative_type === 'full_ad' ? ['headline', 'body', 'cta'] : [creative_type];

    for (let i = 0; i < 3; i++) {
      const variation: Record<string, string> = {};
      if (types.includes('headline') || creative_type === 'full_ad') {
        const headlines = [
          `Transform Your ${brief || 'Results'} Today`,
          `The Smarter Way to ${brief || 'Succeed'}`,
          `Discover What ${brief || 'Success'} Looks Like`,
        ];
        variation.headline = headlines[i] || headlines[0];
      }
      if (types.includes('body') || types.includes('ad_copy') || creative_type === 'full_ad') {
        variation.body = `${brief || 'Our solution'} helps you achieve more with less effort. Join thousands of satisfied customers who made the switch.`;
      }
      if (types.includes('cta') || creative_type === 'full_ad') {
        const ctas = ['Shop Now', 'Learn More', 'Get Started'];
        variation.cta = ctas[i] || ctas[0];
      }
      if (types.includes('description')) {
        variation.description = `${brief || 'Premium quality'} at an unbeatable price. Limited time offer.`;
      }
      variations.push(variation);
    }

    const content = { variations, brand_context_used: !!brandContext, brief };

    const result = await pool.query(
      'INSERT INTO generated_creatives (user_id, creative_type, platform, content, inspiration_ad_id, brand_vault_used) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [userId, creative_type || 'ad_copy', platform || 'general', JSON.stringify(content), inspiration_ad_id, !!use_brand_vault]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error generating creative:', err);
    res.status(500).json({ error: 'Failed to generate' });
  }
});

router.post('/:id/rate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { rating } = req.body;
    await pool.query('UPDATE generated_creatives SET rating = $1 WHERE id = $2 AND user_id = $3', [rating, parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error rating creative:', err);
    res.status(500).json({ error: 'Failed to rate' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM generated_creatives WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting creative:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
