import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import pool from '../db';
import { validateBody } from '../middleware/validate';
import { publishCampaignDraft, activateCampaign, validateDraft } from '../services/campaign-publisher';
import { searchInterests, getCustomAudiences, getAdAccountPages } from '../services/meta-api';
import { decrypt } from '../services/oauth-providers';

const router = Router();

// ── Multer setup for media uploads ──────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/campaign-media');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|mp4|mov|webp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

// Helper: resolve access token
async function getAccessToken(userId: number): Promise<string> {
  const result = await pool.query(
    `SELECT credentials FROM integration_configs
     WHERE user_id = $1 AND platform = 'meta' AND status = 'connected' AND connection_method = 'oauth'`,
    [userId]
  );
  if (result.rows.length === 0) throw new Error('No connected Meta account');
  const creds = result.rows[0].credentials;
  if (!creds?.access_token_encrypted) throw new Error('No access token');
  return decrypt(creds.access_token_encrypted);
}

// ── Zod schemas ─────────────────────────────────────────────
const createDraftSchema = z.object({
  account_id: z.number(),
  name: z.string().min(1).max(200),
  objective: z.string().default('OUTCOME_TRAFFIC'),
  special_ad_categories: z.array(z.string()).optional(),
});

const updateDraftSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  objective: z.string().optional(),
  special_ad_categories: z.array(z.string()).optional(),
  config: z.record(z.string(), z.any()).optional(),
});

const createAdsetSchema = z.object({
  name: z.string().min(1).max(200),
  targeting: z.record(z.string(), z.any()).optional(),
  budget_type: z.enum(['daily', 'lifetime']).default('daily'),
  budget_cents: z.number().min(100).default(2000),
  bid_strategy: z.string().optional(),
  schedule_start: z.string().optional(),
  schedule_end: z.string().optional(),
});

const updateAdsetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targeting: z.record(z.string(), z.any()).optional(),
  budget_type: z.enum(['daily', 'lifetime']).optional(),
  budget_cents: z.number().min(100).optional(),
  bid_strategy: z.string().optional(),
  schedule_start: z.string().nullable().optional(),
  schedule_end: z.string().nullable().optional(),
});

const createAdSchema = z.object({
  name: z.string().min(1).max(200),
  creative_config: z.record(z.string(), z.any()).optional(),
  generated_creative_id: z.number().optional(),
  media_upload_id: z.number().optional(),
});

const updateAdSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  creative_config: z.record(z.string(), z.any()).optional(),
  generated_creative_id: z.number().nullable().optional(),
  media_upload_id: z.number().nullable().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  objective: z.string().optional(),
  targeting: z.record(z.string(), z.any()).optional(),
  budget_config: z.record(z.string(), z.any()).optional(),
  creative_config: z.record(z.string(), z.any()).optional(),
  config: z.record(z.string(), z.any()).optional(),
  is_shared: z.boolean().optional(),
});

// ── Draft CRUD ──────────────────────────────────────────────

router.get('/drafts', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT cd.*, a.name AS account_name, a.platform
       FROM campaign_drafts cd
       LEFT JOIN accounts a ON a.id = cd.account_id
       WHERE cd.user_id = $1 AND cd.status != 'archived'
       ORDER BY cd.updated_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching drafts:', err);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

router.post('/drafts', validateBody(createDraftSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { account_id, name, objective, special_ad_categories } = req.body;
    const result = await pool.query(
      `INSERT INTO campaign_drafts (user_id, account_id, name, objective, special_ad_categories)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, account_id, name, objective, JSON.stringify(special_ad_categories || [])]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating draft:', err);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

router.get('/drafts/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const draftId = parseInt(req.params.id);
    const draftRes = await pool.query(
      `SELECT cd.*, a.name AS account_name, a.platform, a.platform_account_id
       FROM campaign_drafts cd
       LEFT JOIN accounts a ON a.id = cd.account_id
       WHERE cd.id = $1 AND cd.user_id = $2`,
      [draftId, userId]
    );
    if (draftRes.rows.length === 0) { res.status(404).json({ error: 'Draft not found' }); return; }

    const adsetsRes = await pool.query('SELECT * FROM campaign_adsets WHERE draft_id = $1 ORDER BY id', [draftId]);
    const adsets = [];
    for (const adset of adsetsRes.rows) {
      const adsRes = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1 ORDER BY id', [adset.id]);
      adsets.push({ ...adset, ads: adsRes.rows });
    }

    res.json({ ...draftRes.rows[0], adsets });
  } catch (err) {
    console.error('Error fetching draft:', err);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

router.put('/drafts/:id', validateBody(updateDraftSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const draftId = parseInt(req.params.id);
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        if (key === 'special_ad_categories' || key === 'config') {
          fields.push(`${key} = $${idx++}::JSONB`);
          values.push(JSON.stringify(val));
        } else {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
    }
    if (fields.length === 0) { res.json({ success: true }); return; }

    fields.push(`updated_at = NOW()`);
    values.push(draftId, userId);
    const result = await pool.query(
      `UPDATE campaign_drafts SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating draft:', err);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

router.delete('/drafts/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query(
      "UPDATE campaign_drafts SET status = 'archived', updated_at = NOW() WHERE id = $1 AND user_id = $2",
      [parseInt(req.params.id), userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting draft:', err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// ── Publish & Activate ──────────────────────────────────────

router.post('/drafts/:id/publish', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const draftId = parseInt(req.params.id);
    const result = await publishCampaignDraft(draftId, userId);
    res.json(result);
  } catch (err: any) {
    console.error('Error publishing draft:', err);
    res.status(500).json({ error: err.message || 'Failed to publish' });
  }
});

router.post('/drafts/:id/activate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    await activateCampaign(parseInt(req.params.id), userId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error activating campaign:', err);
    res.status(500).json({ error: err.message || 'Failed to activate' });
  }
});

router.get('/drafts/:id/validate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const result = await validateDraft(parseInt(req.params.id), userId);
    res.json(result);
  } catch (err) {
    console.error('Error validating draft:', err);
    res.status(500).json({ error: 'Failed to validate' });
  }
});

// ── Ad Set CRUD ─────────────────────────────────────────────

router.post('/drafts/:id/adsets', validateBody(createAdsetSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const draftId = parseInt(req.params.id);

    // Verify ownership
    const check = await pool.query('SELECT id FROM campaign_drafts WHERE id = $1 AND user_id = $2', [draftId, userId]);
    if (check.rows.length === 0) { res.status(404).json({ error: 'Draft not found' }); return; }

    const { name, targeting, budget_type, budget_cents, bid_strategy, schedule_start, schedule_end } = req.body;
    const result = await pool.query(
      `INSERT INTO campaign_adsets (draft_id, name, targeting, budget_type, budget_cents, bid_strategy, schedule_start, schedule_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [draftId, name, JSON.stringify(targeting || {}), budget_type, budget_cents, bid_strategy || 'LOWEST_COST_WITHOUT_CAP', schedule_start || null, schedule_end || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating adset:', err);
    res.status(500).json({ error: 'Failed to create ad set' });
  }
});

router.put('/adsets/:id', validateBody(updateAdsetSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const adsetId = parseInt(req.params.id);

    // Verify ownership via draft
    const check = await pool.query(
      `SELECT ca.id FROM campaign_adsets ca
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE ca.id = $1 AND cd.user_id = $2`,
      [adsetId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad set not found' }); return; }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        if (key === 'targeting') {
          fields.push(`${key} = $${idx++}::JSONB`);
          values.push(JSON.stringify(val));
        } else {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
    }
    if (fields.length === 0) { res.json({ success: true }); return; }

    fields.push('updated_at = NOW()');
    values.push(adsetId);
    const result = await pool.query(
      `UPDATE campaign_adsets SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating adset:', err);
    res.status(500).json({ error: 'Failed to update ad set' });
  }
});

router.delete('/adsets/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const adsetId = parseInt(req.params.id);
    const check = await pool.query(
      `SELECT ca.id FROM campaign_adsets ca
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE ca.id = $1 AND cd.user_id = $2`,
      [adsetId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad set not found' }); return; }
    await pool.query('DELETE FROM campaign_adsets WHERE id = $1', [adsetId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting adset:', err);
    res.status(500).json({ error: 'Failed to delete ad set' });
  }
});

// ── Ad CRUD ─────────────────────────────────────────────────

router.post('/adsets/:id/ads', validateBody(createAdSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const adsetId = parseInt(req.params.id);

    // Verify ownership
    const check = await pool.query(
      `SELECT ca.id FROM campaign_adsets ca
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE ca.id = $1 AND cd.user_id = $2`,
      [adsetId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad set not found' }); return; }

    const { name, creative_config, generated_creative_id, media_upload_id } = req.body;
    const result = await pool.query(
      `INSERT INTO campaign_ads (adset_id, name, creative_config, generated_creative_id, media_upload_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [adsetId, name, JSON.stringify(creative_config || {}), generated_creative_id || null, media_upload_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating ad:', err);
    res.status(500).json({ error: 'Failed to create ad' });
  }
});

router.put('/ads/:id', validateBody(updateAdSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const adId = parseInt(req.params.id);

    const check = await pool.query(
      `SELECT cad.id FROM campaign_ads cad
       JOIN campaign_adsets ca ON ca.id = cad.adset_id
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE cad.id = $1 AND cd.user_id = $2`,
      [adId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad not found' }); return; }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        if (key === 'creative_config') {
          fields.push(`${key} = $${idx++}::JSONB`);
          values.push(JSON.stringify(val));
        } else {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
    }
    if (fields.length === 0) { res.json({ success: true }); return; }

    fields.push('updated_at = NOW()');
    values.push(adId);
    const result = await pool.query(
      `UPDATE campaign_ads SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating ad:', err);
    res.status(500).json({ error: 'Failed to update ad' });
  }
});

router.delete('/ads/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const adId = parseInt(req.params.id);
    const check = await pool.query(
      `SELECT cad.id FROM campaign_ads cad
       JOIN campaign_adsets ca ON ca.id = cad.adset_id
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE cad.id = $1 AND cd.user_id = $2`,
      [adId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad not found' }); return; }
    await pool.query('DELETE FROM campaign_ads WHERE id = $1', [adId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting ad:', err);
    res.status(500).json({ error: 'Failed to delete ad' });
  }
});

// ── Media Upload ────────────────────────────────────────────

router.post('/media/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file provided' }); return; }

    const accountId = req.body.account_id ? parseInt(req.body.account_id) : null;
    const result = await pool.query(
      `INSERT INTO campaign_media_uploads (user_id, account_id, filename, mime_type, file_size, file_path)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, accountId, file.originalname, file.mimetype, file.size, file.path]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error uploading media:', err);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// ── Targeting helpers ───────────────────────────────────────

router.get('/targeting/interests', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const q = req.query.q as string;
    if (!q || q.length < 2) { res.json([]); return; }
    const accessToken = await getAccessToken(userId);
    const results = await searchInterests(q, accessToken);
    res.json(results);
  } catch (err: any) {
    console.error('Error searching interests:', err);
    res.status(500).json({ error: err.message || 'Failed to search interests' });
  }
});

router.get('/targeting/audiences', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const accountId = req.query.account_id as string;
    if (!accountId) { res.status(400).json({ error: 'account_id required' }); return; }

    const acctRes = await pool.query('SELECT platform_account_id FROM accounts WHERE id = $1 AND user_id = $2', [parseInt(accountId), userId]);
    if (acctRes.rows.length === 0) { res.status(404).json({ error: 'Account not found' }); return; }
    const pid = acctRes.rows[0].platform_account_id;
    const actId = pid.startsWith('act_') ? pid : `act_${pid}`;

    const accessToken = await getAccessToken(userId);
    const audiences = await getCustomAudiences(actId, accessToken);
    res.json(audiences);
  } catch (err: any) {
    console.error('Error fetching audiences:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch audiences' });
  }
});

router.get('/account-pages', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const accountId = req.query.account_id as string;
    if (!accountId) { res.status(400).json({ error: 'account_id required' }); return; }

    const acctRes = await pool.query('SELECT platform_account_id FROM accounts WHERE id = $1 AND user_id = $2', [parseInt(accountId), userId]);
    if (acctRes.rows.length === 0) { res.status(404).json({ error: 'Account not found' }); return; }
    const pid = acctRes.rows[0].platform_account_id;
    const actId = pid.startsWith('act_') ? pid : `act_${pid}`;

    const accessToken = await getAccessToken(userId);
    const pages = await getAdAccountPages(actId, accessToken);
    res.json(pages);
  } catch (err: any) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch pages' });
  }
});

// ── Campaign Templates ──────────────────────────────────────

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT * FROM campaign_templates WHERE user_id = $1 OR is_shared = true ORDER BY updated_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', validateBody(createTemplateSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, objective, targeting, budget_config, creative_config, config, is_shared } = req.body;
    const result = await pool.query(
      `INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [userId, name, description, objective, JSON.stringify(targeting || {}), JSON.stringify(budget_config || {}), JSON.stringify(creative_config || {}), JSON.stringify(config || {}), is_shared || false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.post('/templates/:id/use', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const templateId = parseInt(req.params.id);
    const tmpl = await pool.query(
      'SELECT * FROM campaign_templates WHERE id = $1 AND (user_id = $2 OR is_shared = true)',
      [templateId, userId]
    );
    if (tmpl.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }

    const t = tmpl.rows[0];
    const { account_id } = req.body;
    const budgetConfig = t.budget_config || {};

    // Create draft from template
    const draftRes = await pool.query(
      `INSERT INTO campaign_drafts (user_id, account_id, name, objective, config)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, account_id || null, `${t.name} - Copy`, t.objective || 'OUTCOME_TRAFFIC', JSON.stringify(t.config || {})]
    );
    const draftId = draftRes.rows[0].id;

    // Create default ad set from template targeting/budget
    const adsetRes = await pool.query(
      `INSERT INTO campaign_adsets (draft_id, name, targeting, budget_type, budget_cents, bid_strategy)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        draftId,
        'Ad Set 1',
        JSON.stringify(t.targeting || {}),
        budgetConfig.budget_type || 'daily',
        budgetConfig.budget_cents || 2000,
        budgetConfig.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      ]
    );

    // Create default ad from template creative config
    if (t.creative_config && Object.keys(t.creative_config).length > 0) {
      await pool.query(
        `INSERT INTO campaign_ads (adset_id, name, creative_config)
         VALUES ($1, $2, $3)`,
        [adsetRes.rows[0].id, 'Ad 1', JSON.stringify(t.creative_config)]
      );
    }

    res.json(draftRes.rows[0]);
  } catch (err) {
    console.error('Error using template:', err);
    res.status(500).json({ error: 'Failed to create from template' });
  }
});

router.put('/templates/:id', validateBody(createTemplateSchema.partial()), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const templateId = parseInt(req.params.id);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const jsonFields = ['targeting', 'budget_config', 'creative_config', 'config'];

    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        if (jsonFields.includes(key)) {
          fields.push(`${key} = $${idx++}::JSONB`);
          values.push(JSON.stringify(val));
        } else {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
    }
    if (fields.length === 0) { res.json({ success: true }); return; }

    fields.push('updated_at = NOW()');
    values.push(templateId, userId);
    const result = await pool.query(
      `UPDATE campaign_templates SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating template:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM campaign_templates WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
