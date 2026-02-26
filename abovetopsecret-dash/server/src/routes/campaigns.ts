import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { validateBody } from '../middleware/validate';
import { publishDraft, activateDraftCampaign, validateDraftCampaign } from '../services/campaign-publisher';
import { searchInterests, getCustomAudiences, getAdAccountPages } from '../services/meta-api';
import { decrypt } from '../services/oauth-providers';

const router = Router();

// ── Rate limiters ───────────────────────────────────────────
const publishLimiter = rateLimit({ windowMs: 60_000, max: 5, keyGenerator: (req) => String(req.user?.id), message: { error: 'Too many publish attempts' } });
const metaApiLimiter = rateLimit({ windowMs: 60_000, max: 30, keyGenerator: (req) => String(req.user?.id), message: { error: 'Too many requests' } });

// ── Helper: parse + validate ID param ───────────────────────
function parseId(val: string, res: Response): number | null {
  const id = parseInt(val, 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: 'Invalid ID' }); return null; }
  return id;
}

// ── Multer setup for media uploads ──────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/campaign-media');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extOk = /\.(jpg|jpeg|png|gif|mp4|mov|webp)$/i.test(path.extname(file.originalname));
    const mimeOk = ALLOWED_MIMES.includes(file.mimetype);
    cb(null, extOk && mimeOk);
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
  account_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  objective: z.string().default('OUTCOME_TRAFFIC'),
  special_ad_categories: z.array(z.string()).optional(),
  platform: z.enum(['meta', 'tiktok', 'newsbreak']).default('meta'),
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
  budget_cents: z.number().int().min(100).max(100_000_000).default(2000),
  bid_strategy: z.string().optional(),
  schedule_start: z.string().optional(),
  schedule_end: z.string().optional(),
});

const updateAdsetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targeting: z.record(z.string(), z.any()).optional(),
  budget_type: z.enum(['daily', 'lifetime']).optional(),
  budget_cents: z.number().int().min(100).max(100_000_000).optional(),
  bid_strategy: z.string().optional(),
  schedule_start: z.string().nullable().optional(),
  schedule_end: z.string().nullable().optional(),
});

const createAdSchema = z.object({
  name: z.string().min(1).max(200),
  creative_config: z.record(z.string(), z.any()).optional(),
  generated_creative_id: z.number().int().positive().optional(),
  media_upload_id: z.number().int().positive().optional(),
  library_creative_id: z.number().int().positive().optional(),
});

const updateAdSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  creative_config: z.record(z.string(), z.any()).optional(),
  generated_creative_id: z.number().int().positive().nullable().optional(),
  media_upload_id: z.number().int().positive().nullable().optional(),
  library_creative_id: z.number().int().positive().nullable().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  objective: z.string().optional(),
  targeting: z.record(z.string(), z.any()).optional(),
  budget_config: z.record(z.string(), z.any()).optional(),
  creative_config: z.record(z.string(), z.any()).optional(),
  config: z.record(z.string(), z.any()).optional(),
  is_shared: z.boolean().optional(),
});

const useTemplateSchema = z.object({
  account_id: z.number().int().positive().optional(),
});

// ── Whitelisted update fields (prevents SQL column injection) ─
const DRAFT_UPDATE_FIELDS = ['name', 'objective', 'special_ad_categories', 'config'];
const DRAFT_JSON_FIELDS = ['special_ad_categories', 'config'];

const ADSET_UPDATE_FIELDS = ['name', 'targeting', 'budget_type', 'budget_cents', 'bid_strategy', 'schedule_start', 'schedule_end'];
const ADSET_JSON_FIELDS = ['targeting'];

const AD_UPDATE_FIELDS = ['name', 'creative_config', 'generated_creative_id', 'media_upload_id', 'library_creative_id'];
const AD_JSON_FIELDS = ['creative_config'];

const TEMPLATE_UPDATE_FIELDS = ['name', 'description', 'objective', 'targeting', 'budget_config', 'creative_config', 'config', 'is_shared'];
const TEMPLATE_JSON_FIELDS = ['targeting', 'budget_config', 'creative_config', 'config'];

function buildUpdateQuery(
  body: Record<string, any>,
  allowedFields: string[],
  jsonFields: string[],
): { fields: string[]; values: any[]; idx: number } {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;
  for (const key of allowedFields) {
    const val = body[key];
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
  return { fields, values, idx };
}

// ── Draft CRUD ──────────────────────────────────────────────

router.get('/drafts', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { account_id, name, objective, special_ad_categories, platform } = req.body;

    // Verify account ownership
    const acctCheck = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [account_id, userId]);
    if (acctCheck.rows.length === 0) { res.status(403).json({ error: 'Account not found' }); return; }

    const result = await pool.query(
      `INSERT INTO campaign_drafts (user_id, account_id, name, objective, special_ad_categories, platform)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, account_id, name, objective, JSON.stringify(special_ad_categories || []), platform || 'meta']
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const draftId = parseId(req.params.id, res);
    if (draftId === null) return;

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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const draftId = parseId(req.params.id, res);
    if (draftId === null) return;

    const { fields, values, idx } = buildUpdateQuery(req.body, DRAFT_UPDATE_FIELDS, DRAFT_JSON_FIELDS);
    if (fields.length === 0) { res.json({ success: true }); return; }

    fields.push('updated_at = NOW()');
    values.push(draftId, userId);
    const result = await pool.query(
      `UPDATE campaign_drafts SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const draftId = parseId(req.params.id, res);
    if (draftId === null) return;

    await pool.query(
      "UPDATE campaign_drafts SET status = 'archived', updated_at = NOW() WHERE id = $1 AND user_id = $2",
      [draftId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting draft:', err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// ── Publish & Activate ──────────────────────────────────────

router.post('/drafts/:id/publish', publishLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const draftId = parseId(req.params.id, res);
    if (draftId === null) return;

    const result = await publishDraft(draftId, userId);
    res.json(result);
  } catch (err: any) {
    console.error('Error publishing draft:', err);
    res.status(500).json({ error: 'Failed to publish campaign' });
  }
});

router.post('/drafts/:id/activate', publishLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const draftId = parseId(req.params.id, res);
    if (draftId === null) return;

    await activateDraftCampaign(draftId, userId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error activating campaign:', err);
    res.status(500).json({ error: 'Failed to activate campaign' });
  }
});

router.get('/drafts/:id/validate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const draftId = parseId(req.params.id, res);
    if (draftId === null) return;

    const result = await validateDraftCampaign(draftId, userId);
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const draftId = parseId(req.params.id, res);
    if (draftId === null) return;

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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const adsetId = parseId(req.params.id, res);
    if (adsetId === null) return;

    const check = await pool.query(
      `SELECT ca.id FROM campaign_adsets ca
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE ca.id = $1 AND cd.user_id = $2`,
      [adsetId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad set not found' }); return; }

    const { fields, values, idx } = buildUpdateQuery(req.body, ADSET_UPDATE_FIELDS, ADSET_JSON_FIELDS);
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const adsetId = parseId(req.params.id, res);
    if (adsetId === null) return;

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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const adsetId = parseId(req.params.id, res);
    if (adsetId === null) return;

    const check = await pool.query(
      `SELECT ca.id FROM campaign_adsets ca
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE ca.id = $1 AND cd.user_id = $2`,
      [adsetId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad set not found' }); return; }

    const { name, creative_config, generated_creative_id, media_upload_id, library_creative_id } = req.body;
    const result = await pool.query(
      `INSERT INTO campaign_ads (adset_id, name, creative_config, generated_creative_id, media_upload_id, library_creative_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [adsetId, name, JSON.stringify(creative_config || {}), generated_creative_id || null, media_upload_id || null, library_creative_id || null]
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const adId = parseId(req.params.id, res);
    if (adId === null) return;

    const check = await pool.query(
      `SELECT cad.id FROM campaign_ads cad
       JOIN campaign_adsets ca ON ca.id = cad.adset_id
       JOIN campaign_drafts cd ON cd.id = ca.draft_id
       WHERE cad.id = $1 AND cd.user_id = $2`,
      [adId, userId]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Ad not found' }); return; }

    const { fields, values, idx } = buildUpdateQuery(req.body, AD_UPDATE_FIELDS, AD_JSON_FIELDS);
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const adId = parseId(req.params.id, res);
    if (adId === null) return;

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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file provided or invalid file type' }); return; }

    const accountId = req.body.account_id ? parseInt(req.body.account_id, 10) : null;
    if (accountId !== null && isNaN(accountId)) { res.status(400).json({ error: 'Invalid account_id' }); return; }

    // Verify account ownership if provided
    if (accountId) {
      const acctCheck = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
      if (acctCheck.rows.length === 0) { res.status(403).json({ error: 'Account not found' }); return; }
    }

    const result = await pool.query(
      `INSERT INTO campaign_media_uploads (user_id, account_id, filename, mime_type, file_size, file_path)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, user_id, account_id, filename, mime_type, file_size, status, created_at`,
      [userId, accountId, file.originalname, file.mimetype, file.size, file.path]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error uploading media:', err);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// ── Targeting helpers ───────────────────────────────────────

router.get('/targeting/interests', metaApiLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const q = req.query.q as string;
    if (!q || q.length < 2) { res.json([]); return; }
    const accessToken = await getAccessToken(userId);
    const results = await searchInterests(q, accessToken);
    res.json(results);
  } catch (err) {
    console.error('Error searching interests:', err);
    res.status(500).json({ error: 'Failed to search interests' });
  }
});

router.get('/targeting/audiences', metaApiLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const accountId = parseId(req.query.account_id as string, res);
    if (accountId === null) return;

    const acctRes = await pool.query('SELECT platform_account_id FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
    if (acctRes.rows.length === 0) { res.status(404).json({ error: 'Account not found' }); return; }
    const pid = acctRes.rows[0].platform_account_id;
    const actId = pid.startsWith('act_') ? pid : `act_${pid}`;

    const accessToken = await getAccessToken(userId);
    const audiences = await getCustomAudiences(actId, accessToken);
    res.json(audiences);
  } catch (err) {
    console.error('Error fetching audiences:', err);
    res.status(500).json({ error: 'Failed to fetch audiences' });
  }
});

router.get('/account-pages', metaApiLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const accountId = parseId(req.query.account_id as string, res);
    if (accountId === null) return;

    const acctRes = await pool.query('SELECT platform_account_id FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
    if (acctRes.rows.length === 0) { res.status(404).json({ error: 'Account not found' }); return; }
    const pid = acctRes.rows[0].platform_account_id;
    const actId = pid.startsWith('act_') ? pid : `act_${pid}`;

    const accessToken = await getAccessToken(userId);
    const pages = await getAdAccountPages(actId, accessToken);
    res.json(pages);
  } catch (err) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// ── Campaign Templates ──────────────────────────────────────

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
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

router.post('/templates/:id/use', validateBody(useTemplateSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const templateId = parseId(req.params.id, res);
    if (templateId === null) return;

    const tmpl = await pool.query(
      'SELECT * FROM campaign_templates WHERE id = $1 AND (user_id = $2 OR is_shared = true)',
      [templateId, userId]
    );
    if (tmpl.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }

    const t = tmpl.rows[0];
    const { account_id } = req.body;

    // Verify account ownership if provided
    if (account_id) {
      const acctCheck = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [account_id, userId]);
      if (acctCheck.rows.length === 0) { res.status(403).json({ error: 'Account not found' }); return; }
    }

    const budgetConfig = t.budget_config || {};

    const draftRes = await pool.query(
      `INSERT INTO campaign_drafts (user_id, account_id, name, objective, config)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, account_id || null, `${t.name} - Copy`, t.objective || 'OUTCOME_TRAFFIC', JSON.stringify(t.config || {})]
    );
    const draftId = draftRes.rows[0].id;

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

    if (t.creative_config && Object.keys(t.creative_config).length > 0) {
      await pool.query(
        'INSERT INTO campaign_ads (adset_id, name, creative_config) VALUES ($1, $2, $3)',
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const templateId = parseId(req.params.id, res);
    if (templateId === null) return;

    const { fields, values, idx } = buildUpdateQuery(req.body, TEMPLATE_UPDATE_FIELDS, TEMPLATE_JSON_FIELDS);
    if (fields.length === 0) { res.json({ success: true }); return; }

    fields.push('updated_at = NOW()');
    values.push(templateId, userId);
    const result = await pool.query(
      `UPDATE campaign_templates SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
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
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const templateId = parseId(req.params.id, res);
    if (templateId === null) return;

    await pool.query('DELETE FROM campaign_templates WHERE id = $1 AND user_id = $2', [templateId, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ── Live Campaigns (across all platforms) ─────────────────

router.get('/live', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const platform = req.query.platform as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const accountIdParam = req.query.account_id as string | undefined;
    const useArchive = startDate && endDate;

    const platformFilter = platform && platform !== 'all'
      ? `AND platform = '${platform === 'meta' ? 'meta' : platform}'`
      : '';

    // Resolve account filter: internal account_id → platform-specific filters
    let metaAccountFilter = '';
    let tiktokAccountFilter = '';
    let newsbreakAccountFilter = '';
    const queryParams: any[] = [userId];

    if (accountIdParam && accountIdParam !== 'all') {
      const acctId = parseInt(accountIdParam, 10);
      if (!isNaN(acctId)) {
        // Look up the account to determine platform and platform_account_id
        const acctRes = await pool.query(
          'SELECT id, platform, platform_account_id FROM accounts WHERE id = $1 AND user_id = $2',
          [acctId, userId]
        );
        if (acctRes.rows.length > 0) {
          const acct = acctRes.rows[0];
          if (acct.platform === 'meta') {
            metaAccountFilter = ` AND account_id = ${acctId}`;
          } else if (acct.platform === 'tiktok') {
            tiktokAccountFilter = ` AND t.account_id = ${acctId}`;
          } else if (acct.platform === 'newsbreak') {
            // newsbreak_ads_today.account_id is TEXT (platform-level ID)
            const platformAcctId = acct.platform_account_id || '';
            newsbreakAccountFilter = ` AND n.account_id = '${platformAcctId.replace(/'/g, "''")}'`;
          }
        }
      }
    }

    let result;
    if (useArchive) {
      queryParams.push(startDate, endDate);
      // Historical data from archive tables
      result = await pool.query(`
        WITH all_campaigns AS (
          SELECT 'meta' AS platform,
            ad_data->>'campaign_id' AS campaign_id,
            ad_data->>'campaign_name' AS campaign_name,
            ad_data->>'account_name' AS account_name,
            SUM((ad_data->>'spend')::numeric) AS spend,
            SUM((ad_data->>'clicks')::numeric) AS clicks,
            SUM((ad_data->>'impressions')::numeric) AS impressions,
            0::numeric AS conversions, 0::numeric AS conversion_value,
            COUNT(DISTINCT ad_data->>'ad_set_id') AS adset_count,
            COUNT(DISTINCT ad_data->>'ad_name') AS ad_count
          FROM fb_ads_archive WHERE user_id = $1 AND archived_date BETWEEN $2 AND $3${metaAccountFilter}
          GROUP BY ad_data->>'campaign_id', ad_data->>'campaign_name', ad_data->>'account_name'
          UNION ALL
          SELECT 'tiktok' AS platform,
            ad_data->>'campaign_id' AS campaign_id,
            ad_data->>'campaign_name' AS campaign_name,
            COALESCE(a.name, 'TikTok') AS account_name,
            SUM((ad_data->>'spend')::numeric), SUM((ad_data->>'clicks')::numeric), SUM((ad_data->>'impressions')::numeric),
            COALESCE(SUM((ad_data->>'conversions')::numeric), 0), COALESCE(SUM((ad_data->>'conversion_value')::numeric), 0),
            COUNT(DISTINCT ad_data->>'adgroup_id'), COUNT(DISTINCT ad_data->>'ad_name')
          FROM tiktok_ads_archive t LEFT JOIN accounts a ON a.id = t.account_id
          WHERE t.user_id = $1 AND t.archived_date BETWEEN $2 AND $3${tiktokAccountFilter}
          GROUP BY ad_data->>'campaign_id', ad_data->>'campaign_name', a.name
          UNION ALL
          SELECT 'newsbreak' AS platform,
            ad_data->>'campaign_id' AS campaign_id,
            ad_data->>'campaign_name' AS campaign_name,
            COALESCE(a.name, 'NewsBreak') AS account_name,
            SUM((ad_data->>'spend')::numeric), SUM((ad_data->>'clicks')::numeric), SUM((ad_data->>'impressions')::numeric),
            COALESCE(SUM((ad_data->>'conversions')::numeric), 0), COALESCE(SUM((ad_data->>'conversion_value')::numeric), 0),
            COUNT(DISTINCT ad_data->>'adset_id'), COUNT(DISTINCT ad_data->>'ad_name')
          FROM newsbreak_ads_archive n LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.platform_account_id = n.account_id AND a.user_id = n.user_id
          WHERE n.user_id = $1 AND n.archived_date BETWEEN $2 AND $3${newsbreakAccountFilter}
          GROUP BY ad_data->>'campaign_id', ad_data->>'campaign_name', a.name
        )
        SELECT * FROM all_campaigns WHERE 1=1 ${platformFilter}
        ORDER BY spend DESC
      `, queryParams);
    } else {
      // Today's live data
      result = await pool.query(`
        WITH all_campaigns AS (
          SELECT 'meta' AS platform, campaign_id, campaign_name, account_name,
            SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
            0::numeric AS conversions, 0::numeric AS conversion_value,
            COUNT(DISTINCT ad_set_id) AS adset_count, COUNT(DISTINCT ad_name) AS ad_count
          FROM fb_ads_today WHERE user_id = $1${metaAccountFilter}
          GROUP BY campaign_id, campaign_name, account_name
          UNION ALL
          SELECT 'tiktok' AS platform, campaign_id, campaign_name, COALESCE(a.name, 'TikTok') AS account_name,
            SUM(t.spend), SUM(t.clicks), SUM(t.impressions),
            COALESCE(SUM(t.conversions), 0), COALESCE(SUM(t.conversion_value), 0),
            COUNT(DISTINCT t.adgroup_id), COUNT(DISTINCT t.ad_name)
          FROM tiktok_ads_today t LEFT JOIN accounts a ON a.id = t.account_id
          WHERE t.user_id = $1${tiktokAccountFilter}
          GROUP BY t.campaign_id, t.campaign_name, a.name
          UNION ALL
          SELECT 'newsbreak' AS platform, campaign_id, campaign_name, COALESCE(a.name, 'NewsBreak') AS account_name,
            SUM(n.spend), SUM(n.clicks), SUM(n.impressions),
            COALESCE(SUM(n.conversions), 0), COALESCE(SUM(n.conversion_value), 0),
            COUNT(DISTINCT n.adset_id), COUNT(DISTINCT n.ad_name)
          FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.platform_account_id = n.account_id AND a.user_id = n.user_id
          WHERE n.user_id = $1${newsbreakAccountFilter}
          GROUP BY n.campaign_id, n.campaign_name, a.name
        )
        SELECT * FROM all_campaigns WHERE 1=1 ${platformFilter}
        ORDER BY spend DESC
      `, queryParams);
    }

    res.json(result.rows.map(r => ({
      platform: r.platform,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      account_name: r.account_name,
      spend: parseFloat(r.spend) || 0,
      clicks: parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
      conversions: parseInt(r.conversions) || 0,
      conversion_value: parseFloat(r.conversion_value) || 0,
      roas: parseFloat(r.spend) > 0 ? (parseFloat(r.conversion_value) || 0) / parseFloat(r.spend) : 0,
      cpa: parseInt(r.conversions) > 0 ? (parseFloat(r.spend) || 0) / parseInt(r.conversions) : 0,
      adset_count: parseInt(r.adset_count) || 0,
      ad_count: parseInt(r.ad_count) || 0,
    })));
  } catch (err) {
    console.error('Error fetching live campaigns:', err);
    res.status(500).json({ error: 'Failed to fetch live campaigns' });
  }
});

router.get('/live/:platform/:campaignId/adsets', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { platform, campaignId } = req.params;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const useArchive = startDate && endDate;

    let query: string;
    const params: any[] = [userId, campaignId];

    if (useArchive) {
      params.push(startDate, endDate);
      if (platform === 'meta') {
        query = `SELECT ad_data->>'ad_set_id' AS adset_id, ad_data->>'ad_set_name' AS adset_name,
          SUM((ad_data->>'spend')::numeric) AS spend, SUM((ad_data->>'clicks')::numeric) AS clicks,
          SUM((ad_data->>'impressions')::numeric) AS impressions,
          0::numeric AS conversions, 0::numeric AS conversion_value,
          COUNT(DISTINCT ad_data->>'ad_name') AS ad_count
          FROM fb_ads_archive WHERE user_id = $1 AND ad_data->>'campaign_id' = $2 AND archived_date BETWEEN $3 AND $4
          GROUP BY ad_data->>'ad_set_id', ad_data->>'ad_set_name' ORDER BY spend DESC`;
      } else if (platform === 'tiktok') {
        query = `SELECT ad_data->>'adgroup_id' AS adset_id, ad_data->>'adgroup_name' AS adset_name,
          SUM((ad_data->>'spend')::numeric) AS spend, SUM((ad_data->>'clicks')::numeric) AS clicks,
          SUM((ad_data->>'impressions')::numeric) AS impressions,
          COALESCE(SUM((ad_data->>'conversions')::numeric), 0) AS conversions,
          COALESCE(SUM((ad_data->>'conversion_value')::numeric), 0) AS conversion_value,
          COUNT(DISTINCT ad_data->>'ad_name') AS ad_count
          FROM tiktok_ads_archive WHERE user_id = $1 AND ad_data->>'campaign_id' = $2 AND archived_date BETWEEN $3 AND $4
          GROUP BY ad_data->>'adgroup_id', ad_data->>'adgroup_name' ORDER BY spend DESC`;
      } else {
        query = `SELECT ad_data->>'adset_id' AS adset_id, ad_data->>'adset_name' AS adset_name,
          SUM((ad_data->>'spend')::numeric) AS spend, SUM((ad_data->>'clicks')::numeric) AS clicks,
          SUM((ad_data->>'impressions')::numeric) AS impressions,
          COALESCE(SUM((ad_data->>'conversions')::numeric), 0) AS conversions,
          COALESCE(SUM((ad_data->>'conversion_value')::numeric), 0) AS conversion_value,
          COUNT(DISTINCT ad_data->>'ad_name') AS ad_count
          FROM newsbreak_ads_archive WHERE user_id = $1 AND ad_data->>'campaign_id' = $2 AND archived_date BETWEEN $3 AND $4
          GROUP BY ad_data->>'adset_id', ad_data->>'adset_name' ORDER BY spend DESC`;
      }
    } else {
      if (platform === 'meta') {
        query = `SELECT ad_set_id AS adset_id, ad_set_name AS adset_name,
          SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
          0::numeric AS conversions, 0::numeric AS conversion_value, COUNT(DISTINCT ad_name) AS ad_count
          FROM fb_ads_today WHERE user_id = $1 AND campaign_id = $2
          GROUP BY ad_set_id, ad_set_name ORDER BY spend DESC`;
      } else if (platform === 'tiktok') {
        query = `SELECT adgroup_id AS adset_id, adgroup_name AS adset_name,
          SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
          COALESCE(SUM(conversions), 0) AS conversions, COALESCE(SUM(conversion_value), 0) AS conversion_value,
          COUNT(DISTINCT ad_name) AS ad_count
          FROM tiktok_ads_today WHERE user_id = $1 AND campaign_id = $2
          GROUP BY adgroup_id, adgroup_name ORDER BY spend DESC`;
      } else {
        query = `SELECT adset_id, adset_name,
          SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
          COALESCE(SUM(conversions), 0) AS conversions, COALESCE(SUM(conversion_value), 0) AS conversion_value,
          COUNT(DISTINCT ad_name) AS ad_count
          FROM newsbreak_ads_today WHERE user_id = $1 AND campaign_id = $2
          GROUP BY adset_id, adset_name ORDER BY spend DESC`;
      }
    }

    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({
      adset_id: r.adset_id,
      adset_name: r.adset_name,
      spend: parseFloat(r.spend) || 0,
      clicks: parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
      conversions: parseInt(r.conversions) || 0,
      conversion_value: parseFloat(r.conversion_value) || 0,
      ad_count: parseInt(r.ad_count) || 0,
    })));
  } catch (err) {
    console.error('Error fetching live adsets:', err);
    res.status(500).json({ error: 'Failed to fetch adsets' });
  }
});

router.get('/live/:platform/:adsetId/ads', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { platform, adsetId } = req.params;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const useArchive = startDate && endDate;

    let query: string;
    const params: any[] = [userId, adsetId];

    if (useArchive) {
      params.push(startDate, endDate);
      if (platform === 'meta') {
        query = `SELECT ad_data->>'ad_name' AS ad_name,
          SUM((ad_data->>'spend')::numeric) AS spend, SUM((ad_data->>'clicks')::numeric) AS clicks,
          SUM((ad_data->>'impressions')::numeric) AS impressions,
          0::numeric AS conversions, 0::numeric AS conversion_value
          FROM fb_ads_archive WHERE user_id = $1 AND ad_data->>'ad_set_id' = $2 AND archived_date BETWEEN $3 AND $4
          GROUP BY ad_data->>'ad_name' ORDER BY spend DESC`;
      } else if (platform === 'tiktok') {
        query = `SELECT ad_data->>'ad_name' AS ad_name,
          SUM((ad_data->>'spend')::numeric) AS spend, SUM((ad_data->>'clicks')::numeric) AS clicks,
          SUM((ad_data->>'impressions')::numeric) AS impressions,
          COALESCE(SUM((ad_data->>'conversions')::numeric), 0) AS conversions,
          COALESCE(SUM((ad_data->>'conversion_value')::numeric), 0) AS conversion_value
          FROM tiktok_ads_archive WHERE user_id = $1 AND ad_data->>'adgroup_id' = $2 AND archived_date BETWEEN $3 AND $4
          GROUP BY ad_data->>'ad_name' ORDER BY spend DESC`;
      } else {
        query = `SELECT ad_data->>'ad_id' AS ad_id, ad_data->>'ad_name' AS ad_name,
          SUM((ad_data->>'spend')::numeric) AS spend, SUM((ad_data->>'clicks')::numeric) AS clicks,
          SUM((ad_data->>'impressions')::numeric) AS impressions,
          COALESCE(SUM((ad_data->>'conversions')::numeric), 0) AS conversions,
          COALESCE(SUM((ad_data->>'conversion_value')::numeric), 0) AS conversion_value
          FROM newsbreak_ads_archive WHERE user_id = $1 AND ad_data->>'adset_id' = $2 AND archived_date BETWEEN $3 AND $4
          GROUP BY ad_data->>'ad_id', ad_data->>'ad_name' ORDER BY spend DESC`;
      }
    } else {
      if (platform === 'meta') {
        query = `SELECT ad_name, spend, clicks, impressions, landing_page_views,
          0::numeric AS conversions, 0::numeric AS conversion_value
          FROM fb_ads_today WHERE user_id = $1 AND ad_set_id = $2 ORDER BY spend DESC`;
      } else if (platform === 'tiktok') {
        query = `SELECT ad_name, spend, clicks, impressions, 0 AS landing_page_views,
          COALESCE(conversions, 0) AS conversions, COALESCE(conversion_value, 0) AS conversion_value
          FROM tiktok_ads_today WHERE user_id = $1 AND adgroup_id = $2 ORDER BY spend DESC`;
      } else {
        query = `SELECT ad_id, ad_name, spend, clicks, impressions, 0 AS landing_page_views,
          COALESCE(conversions, 0) AS conversions, COALESCE(conversion_value, 0) AS conversion_value
          FROM newsbreak_ads_today WHERE user_id = $1 AND adset_id = $2 ORDER BY spend DESC`;
      }
    }

    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({
      ad_id: r.ad_id || null,
      ad_name: r.ad_name,
      spend: parseFloat(r.spend) || 0,
      clicks: parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
      conversions: parseInt(r.conversions) || 0,
      conversion_value: parseFloat(r.conversion_value) || 0,
    })));
  } catch (err) {
    console.error('Error fetching live ads:', err);
    res.status(500).json({ error: 'Failed to fetch ads' });
  }
});

import {
  updateNewsBreakCampaignStatus,
  updateNewsBreakAdGroupStatus,
  adjustNewsBreakBudget,
  getNewsBreakAdGroupBudgets,
} from '../services/newsbreak-api';

router.post('/live/status', publishLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { platform, entity_type, entity_id, status } = req.body;

    if (!platform || !entity_type || !entity_id || !status) {
      res.status(400).json({ error: 'Missing required fields: platform, entity_type, entity_id, status' });
      return;
    }

    const enable = status === 'enable' || status === 'ENABLE' || status === 'ACTIVE';

    if (platform === 'newsbreak') {
      const nbStatus = enable ? 'ENABLE' : 'DISABLE';
      if (entity_type === 'campaign') {
        await updateNewsBreakCampaignStatus(entity_id, nbStatus, userId);
      } else if (entity_type === 'adset') {
        await updateNewsBreakAdGroupStatus(entity_id, nbStatus, userId);
      }
    }
    // Meta and TikTok status updates can be added here

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating live status:', err);
    res.status(500).json({ error: err.message || 'Failed to update status' });
  }
});

router.post('/live/budget', publishLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { platform, entity_id, budget_dollars } = req.body;

    if (!platform || !entity_id || budget_dollars === undefined) {
      res.status(400).json({ error: 'Missing required fields: platform, entity_id, budget_dollars' });
      return;
    }

    if (platform === 'newsbreak') {
      await adjustNewsBreakBudget(entity_id, budget_dollars, userId);
    }
    // Meta and TikTok budget adjustments can be added here

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error adjusting budget:', err);
    res.status(500).json({ error: err.message || 'Failed to adjust budget' });
  }
});

// ── Fetch adgroup budgets from NewsBreak API ──────────────────

router.get('/live/budgets/:platform/:campaignId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { platform, campaignId } = req.params;
    if (platform === 'newsbreak') {
      const budgets = await getNewsBreakAdGroupBudgets(campaignId, userId);
      res.json(budgets);
    } else {
      res.json([]);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch budgets' });
  }
});

// ── Assign campaign to account (NB campaign→account mapping) ──

router.post('/assign-account', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { campaign_id, account_id } = req.body;
    if (!campaign_id || !account_id) { res.status(400).json({ error: 'Missing campaign_id or account_id' }); return; }

    // Verify account belongs to user
    const acctCheck = await pool.query(
      'SELECT id, platform_account_id FROM accounts WHERE id = $1 AND user_id = $2',
      [account_id, userId]
    );
    if (acctCheck.rows.length === 0) { res.status(403).json({ error: 'Account not found' }); return; }

    // Upsert mapping
    await pool.query(
      `INSERT INTO nb_campaign_account_map (user_id, campaign_id, account_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, campaign_id) DO UPDATE SET account_id = EXCLUDED.account_id`,
      [userId, campaign_id, account_id]
    );

    // Immediately update newsbreak_ads_today so the change is visible
    const platformAcctId = acctCheck.rows[0].platform_account_id;
    await pool.query(
      `UPDATE newsbreak_ads_today SET account_id = $1 WHERE user_id = $2 AND campaign_id = $3`,
      [platformAcctId, userId, campaign_id]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error assigning campaign account:', err);
    res.status(500).json({ error: err.message || 'Failed to assign account' });
  }
});

// ── Get campaign→account mappings ──

router.get('/account-map', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const result = await pool.query(
      `SELECT m.campaign_id, m.account_id, a.name as account_name
       FROM nb_campaign_account_map m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.user_id = $1`,
      [userId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch account map' });
  }
});

// ── Quick Ad Creator (one-shot: draft → adset → ad → publish) ─

router.post('/quick-create', publishLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const {
      account_id, platform, campaign_name, objective,
      daily_budget, budget_type, adset_name,
      ad_name, headline, ad_text, image_url, video_url, landing_page_url, call_to_action,
      targeting, placements, optimization_goal, bid_type, bid_amount, event_type,
      brand_name, button_text, thumbnail_url,
    } = req.body;

    if (!platform || !campaign_name || !ad_text) {
      res.status(400).json({ error: 'Missing required fields: platform, campaign_name, ad_text' });
      return;
    }

    // Verify account
    if (account_id) {
      const check = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [account_id, userId]);
      if (check.rows.length === 0) { res.status(403).json({ error: 'Account not found' }); return; }
    }

    const budgetCents = Math.round((daily_budget || 10) * 100);

    // Build targeting object
    const targetingObj: Record<string, any> = targeting || {};
    if (placements) targetingObj.placements = placements;
    if (event_type) targetingObj.event_type = event_type;

    // 1. Create draft
    const draftRes = await pool.query(
      `INSERT INTO campaign_drafts (user_id, account_id, name, objective, platform, status)
       VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING id`,
      [userId, account_id || null, campaign_name, objective || 'TRAFFIC', platform]
    );
    const draftId = draftRes.rows[0].id;

    // 2. Create ad set
    const adsetRes = await pool.query(
      `INSERT INTO campaign_adsets (draft_id, name, budget_type, budget_cents, bid_strategy, targeting)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        draftId,
        adset_name || `${campaign_name} - Ad Set`,
        budget_type || 'daily',
        budgetCents,
        bid_type || 'LOWEST_COST_WITHOUT_CAP',
        JSON.stringify(targetingObj),
      ]
    );
    const adsetId = adsetRes.rows[0].id;

    // 3. Create ad
    const creativeConfig: Record<string, any> = {};
    if (headline) creativeConfig.headline = headline;
    if (ad_text) creativeConfig.primary_text = ad_text;
    if (image_url) creativeConfig.image_url = image_url;
    if (video_url) creativeConfig.video_url = video_url;
    if (landing_page_url) creativeConfig.link_url = landing_page_url;
    if (call_to_action) creativeConfig.cta = call_to_action;
    if (brand_name) creativeConfig.brand_name = brand_name;
    if (button_text) creativeConfig.button_text = button_text;
    if (thumbnail_url) creativeConfig.thumbnail_url = thumbnail_url;

    await pool.query(
      `INSERT INTO campaign_ads (adset_id, name, creative_config) VALUES ($1, $2, $3)`,
      [adsetId, ad_name || `${campaign_name} - Ad`, JSON.stringify(creativeConfig)]
    );

    // 4. Publish
    const { publishDraft } = await import('../services/campaign-publisher');
    const publishResult = await publishDraft(draftId, userId);

    res.json({
      ...publishResult,
      draft_id: draftId,
    });
  } catch (err: any) {
    console.error('Error in quick-create:', err);
    res.status(500).json({ error: err.message || 'Failed to create and publish campaign' });
  }
});

// ── Duplicate entity ────────────────────────────────────────

router.post('/duplicate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { entity_type, entity_id, target_parent_id } = req.body;

    if (!entity_type || !entity_id) {
      res.status(400).json({ error: 'Missing entity_type or entity_id' });
      return;
    }

    if (entity_type === 'campaign') {
      // Duplicate an entire draft: campaign + adsets + ads
      const draftRes = await pool.query(
        'SELECT * FROM campaign_drafts WHERE id = $1 AND user_id = $2',
        [entity_id, userId]
      );
      if (draftRes.rows.length === 0) { res.status(404).json({ error: 'Campaign not found' }); return; }
      const d = draftRes.rows[0];

      const newDraft = await pool.query(
        `INSERT INTO campaign_drafts (user_id, account_id, name, objective, platform, status, config, special_ad_categories)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7) RETURNING *`,
        [userId, d.account_id, `${d.name} (Copy)`, d.objective, d.platform, d.config || '{}', d.special_ad_categories || '[]']
      );
      const newDraftId = newDraft.rows[0].id;

      const adsets = await pool.query('SELECT * FROM campaign_adsets WHERE draft_id = $1 ORDER BY id', [entity_id]);
      for (const as of adsets.rows) {
        const newAs = await pool.query(
          `INSERT INTO campaign_adsets (draft_id, name, targeting, budget_type, budget_cents, bid_strategy, schedule_start, schedule_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [newDraftId, as.name, JSON.stringify(as.targeting || {}), as.budget_type, as.budget_cents, as.bid_strategy, as.schedule_start, as.schedule_end]
        );
        const ads = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1 ORDER BY id', [as.id]);
        for (const ad of ads.rows) {
          await pool.query(
            `INSERT INTO campaign_ads (adset_id, name, creative_config, media_upload_id)
             VALUES ($1, $2, $3, $4)`,
            [newAs.rows[0].id, ad.name, JSON.stringify(ad.creative_config || {}), ad.media_upload_id]
          );
        }
      }
      res.json({ success: true, new_id: newDraftId });

    } else if (entity_type === 'adset') {
      // Duplicate an adset + its ads
      const asRes = await pool.query(
        `SELECT ca.* FROM campaign_adsets ca
         JOIN campaign_drafts cd ON cd.id = ca.draft_id
         WHERE ca.id = $1 AND cd.user_id = $2`,
        [entity_id, userId]
      );
      if (asRes.rows.length === 0) { res.status(404).json({ error: 'Ad set not found' }); return; }
      const as = asRes.rows[0];
      const parentDraft = target_parent_id || as.draft_id;

      const newAs = await pool.query(
        `INSERT INTO campaign_adsets (draft_id, name, targeting, budget_type, budget_cents, bid_strategy, schedule_start, schedule_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [parentDraft, `${as.name} (Copy)`, JSON.stringify(as.targeting || {}), as.budget_type, as.budget_cents, as.bid_strategy, as.schedule_start, as.schedule_end]
      );
      const ads = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1 ORDER BY id', [entity_id]);
      for (const ad of ads.rows) {
        await pool.query(
          `INSERT INTO campaign_ads (adset_id, name, creative_config, media_upload_id)
           VALUES ($1, $2, $3, $4)`,
          [newAs.rows[0].id, ad.name, JSON.stringify(ad.creative_config || {}), ad.media_upload_id]
        );
      }
      res.json({ success: true, new_id: newAs.rows[0].id });

    } else if (entity_type === 'ad') {
      const adRes = await pool.query(
        `SELECT cad.* FROM campaign_ads cad
         JOIN campaign_adsets ca ON ca.id = cad.adset_id
         JOIN campaign_drafts cd ON cd.id = ca.draft_id
         WHERE cad.id = $1 AND cd.user_id = $2`,
        [entity_id, userId]
      );
      if (adRes.rows.length === 0) { res.status(404).json({ error: 'Ad not found' }); return; }
      const ad = adRes.rows[0];
      const parentAdset = target_parent_id || ad.adset_id;

      const newAd = await pool.query(
        `INSERT INTO campaign_ads (adset_id, name, creative_config, media_upload_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [parentAdset, `${ad.name} (Copy)`, JSON.stringify(ad.creative_config || {}), ad.media_upload_id]
      );
      res.json({ success: true, new_id: newAd.rows[0].id });
    } else {
      res.status(400).json({ error: 'Invalid entity_type' });
    }
  } catch (err: any) {
    console.error('Error duplicating:', err);
    res.status(500).json({ error: err.message || 'Failed to duplicate' });
  }
});

// ── Batch create (format template launcher) ─────────────────

router.post('/batch-create', publishLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const {
      format, platform, account_id, campaign_name, objective,
      adset_config, creative_config, media_ids, auto_publish,
    } = req.body;

    if (!format || !platform || !campaign_name) {
      res.status(400).json({ error: 'Missing required fields: format, platform, campaign_name' });
      return;
    }

    // Parse format string like "1-3-1" = 1 campaign, 3 adsets, 1 ad per adset
    const parts = String(format).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN) || parts.some(v => v < 1)) {
      res.status(400).json({ error: 'Invalid format. Use pattern like 1-3-1 (campaigns-adsets-adsPerAdset)' });
      return;
    }
    const [campaignCount, adsetCount, adsPerAdset] = parts;
    const totalAds = campaignCount * adsetCount * adsPerAdset;

    if (totalAds > 50) {
      res.status(400).json({ error: 'Maximum 50 total ads per batch' });
      return;
    }

    // Verify account
    if (account_id) {
      const check = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [account_id, userId]);
      if (check.rows.length === 0) { res.status(403).json({ error: 'Account not found' }); return; }
    }

    const ac = adset_config || {};
    const cc = creative_config || {};
    const budgetCents = Math.round((ac.daily_budget || 10) * 100);
    const mediaList: number[] = media_ids || [];
    let mediaIdx = 0;

    const results: { draft_id: number; published?: boolean; error?: string }[] = [];

    for (let ci = 0; ci < campaignCount; ci++) {
      const cName = campaignCount > 1 ? `${campaign_name} ${ci + 1}` : campaign_name;
      const draftRes = await pool.query(
        `INSERT INTO campaign_drafts (user_id, account_id, name, objective, platform, status)
         VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING id`,
        [userId, account_id || null, cName, objective || 'TRAFFIC', platform]
      );
      const draftId = draftRes.rows[0].id;

      for (let si = 0; si < adsetCount; si++) {
        const sName = `${cName} - Ad Set ${si + 1}`;
        const targetingObj: Record<string, any> = { ...(ac.targeting || {}) };
        if (ac.placements) targetingObj.placements = ac.placements;
        if (ac.event_type) targetingObj.event_type = ac.event_type;
        if (ac.optimization_goal) targetingObj.optimization_goal = ac.optimization_goal;
        if (ac.bid_amount) targetingObj.bid_amount = ac.bid_amount;

        const adsetRes = await pool.query(
          `INSERT INTO campaign_adsets (draft_id, name, budget_type, budget_cents, bid_strategy, targeting, schedule_start, schedule_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            draftId, sName,
            ac.budget_type || 'daily', budgetCents,
            ac.bid_type || 'LOWEST_COST_WITHOUT_CAP',
            JSON.stringify(targetingObj),
            ac.schedule_start || null, ac.schedule_end || null,
          ]
        );
        const adsetId = adsetRes.rows[0].id;

        for (let ai = 0; ai < adsPerAdset; ai++) {
          const aName = `${cName} - Ad ${si * adsPerAdset + ai + 1}`;
          const adCreative: Record<string, any> = { ...cc };
          // Distribute media files round-robin
          if (mediaList.length > 0) {
            adCreative.media_upload_id = mediaList[mediaIdx % mediaList.length];
            mediaIdx++;
          }

          await pool.query(
            `INSERT INTO campaign_ads (adset_id, name, creative_config, media_upload_id)
             VALUES ($1, $2, $3, $4)`,
            [adsetId, aName, JSON.stringify(adCreative), adCreative.media_upload_id || null]
          );
        }
      }

      // Optionally auto-publish
      if (auto_publish) {
        try {
          const { publishDraft } = await import('../services/campaign-publisher');
          const pub = await publishDraft(draftId, userId);
          results.push({ draft_id: draftId, published: pub.success, error: pub.error });
        } catch (e: any) {
          results.push({ draft_id: draftId, published: false, error: e.message });
        }
      } else {
        results.push({ draft_id: draftId });
      }
    }

    res.json({ success: true, results });
  } catch (err: any) {
    console.error('Error in batch-create:', err);
    res.status(500).json({ error: err.message || 'Failed to batch create' });
  }
});

export default router;
