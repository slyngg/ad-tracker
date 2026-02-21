import { Router, Request, Response } from 'express';
import pool from '../db';
import { generateAdCopy, generateAdCopyStream, generateVariations, generateABTestSuggestions, extractTemplate } from '../services/ai-creative-gen';

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
    const userId = req.user?.id!;
    const { creative_type, platform, brief, brand_config_id, template_id, inspiration_ad_id, account_id, variation_count } = req.body;

    if (!brief?.trim()) {
      res.status(400).json({ error: 'Brief is required' });
      return;
    }

    const result = await generateAdCopy({
      userId,
      creative_type: creative_type || 'full_ad',
      platform: platform || 'meta',
      brief,
      brand_config_id,
      template_id,
      inspiration_ad_id,
      account_id,
      variation_count: variation_count || 3,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error generating creative:', err);
    res.status(500).json({ error: err.message || 'Failed to generate' });
  }
});

router.post('/generate/stream', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { creative_type, platform, brief, brand_config_id, template_id, inspiration_ad_id, account_id, variation_count } = req.body;

    if (!brief?.trim()) {
      res.status(400).json({ error: 'Brief is required' });
      return;
    }

    await generateAdCopyStream({
      userId,
      creative_type: creative_type || 'full_ad',
      platform: platform || 'meta',
      brief,
      brand_config_id,
      template_id,
      inspiration_ad_id,
      account_id,
      variation_count: variation_count || 3,
    }, res);
  } catch (err: any) {
    console.error('Error streaming creative:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to generate' });
    }
  }
});

router.post('/variations', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { creative_id, count } = req.body;
    if (!creative_id) { res.status(400).json({ error: 'creative_id is required' }); return; }
    const result = await generateVariations(creative_id, userId, count || 3);
    res.json(result);
  } catch (err: any) {
    console.error('Error generating variations:', err);
    res.status(500).json({ error: err.message || 'Failed to generate variations' });
  }
});

router.post('/ab-test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { creative_id } = req.body;
    if (!creative_id) { res.status(400).json({ error: 'creative_id is required' }); return; }
    const result = await generateABTestSuggestions(creative_id, userId);
    res.json(result);
  } catch (err: any) {
    console.error('Error generating A/B test suggestions:', err);
    res.status(500).json({ error: err.message || 'Failed to generate A/B test suggestions' });
  }
});

router.post('/extract-template', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { creative_id } = req.body;
    if (!creative_id) { res.status(400).json({ error: 'creative_id is required' }); return; }
    const result = await extractTemplate(creative_id, userId);
    res.json(result);
  } catch (err: any) {
    console.error('Error extracting template:', err);
    res.status(500).json({ error: err.message || 'Failed to extract template' });
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
