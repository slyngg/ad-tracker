import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db';
import { validateBody } from '../middleware/validate';
import { generateAdCopy, generateAdCopyStream, generateVariations, generateABTestSuggestions, extractTemplate } from '../services/ai-creative-gen';

const router = Router();

const generateSchema = z.object({
  creative_type: z.string().default('full_ad'),
  platform: z.string().default('meta'),
  brief: z.string().min(1).max(5000),
  brand_config_id: z.number().int().positive().optional(),
  template_id: z.number().int().positive().optional(),
  inspiration_ad_id: z.number().int().positive().optional(),
  account_id: z.number().int().positive().optional(),
  variation_count: z.number().int().min(1).max(10).default(3),
});

const variationsSchema = z.object({
  creative_id: z.number().int().positive(),
  count: z.number().int().min(1).max(10).default(3),
});

const creativeIdSchema = z.object({
  creative_id: z.number().int().positive(),
});

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

function parseId(val: string): number | null {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const result = await pool.query('SELECT * FROM generated_creatives WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching generated creatives:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/generate', validateBody(generateSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { creative_type, platform, brief, brand_config_id, template_id, inspiration_ad_id, account_id, variation_count } = req.body;

    const result = await generateAdCopy({
      userId,
      creative_type,
      platform,
      brief,
      brand_config_id,
      template_id,
      inspiration_ad_id,
      account_id,
      variation_count,
    });

    res.json(result);
  } catch (err) {
    console.error('Error generating creative:', err);
    res.status(500).json({ error: 'Failed to generate creative' });
  }
});

router.post('/generate/stream', validateBody(generateSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { creative_type, platform, brief, brand_config_id, template_id, inspiration_ad_id, account_id, variation_count } = req.body;

    await generateAdCopyStream({
      userId,
      creative_type,
      platform,
      brief,
      brand_config_id,
      template_id,
      inspiration_ad_id,
      account_id,
      variation_count,
    }, res);
  } catch (err) {
    console.error('Error streaming creative:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate creative' });
    }
  }
});

router.post('/variations', validateBody(variationsSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { creative_id, count } = req.body;
    const result = await generateVariations(creative_id, userId, count);
    res.json(result);
  } catch (err) {
    console.error('Error generating variations:', err);
    res.status(500).json({ error: 'Failed to generate variations' });
  }
});

router.post('/ab-test', validateBody(creativeIdSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { creative_id } = req.body;
    const result = await generateABTestSuggestions(creative_id, userId);
    res.json(result);
  } catch (err) {
    console.error('Error generating A/B test suggestions:', err);
    res.status(500).json({ error: 'Failed to generate A/B test suggestions' });
  }
});

router.post('/extract-template', validateBody(creativeIdSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { creative_id } = req.body;
    const result = await extractTemplate(creative_id, userId);
    res.json(result);
  } catch (err) {
    console.error('Error extracting template:', err);
    res.status(500).json({ error: 'Failed to extract template' });
  }
});

router.post('/:id/rate', validateBody(ratingSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid ID' }); return; }
    const { rating } = req.body;
    await pool.query('UPDATE generated_creatives SET rating = $1 WHERE id = $2 AND user_id = $3', [rating, id, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error rating creative:', err);
    res.status(500).json({ error: 'Failed to rate' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid ID' }); return; }
    await pool.query('DELETE FROM generated_creatives WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting creative:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
