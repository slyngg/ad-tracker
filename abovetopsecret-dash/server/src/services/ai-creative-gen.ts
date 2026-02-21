import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import pool from '../db';

const anthropic = new Anthropic();

interface GenerateParams {
  userId: number;
  creative_type: string;
  platform: string;
  brief: string;
  brand_config_id?: number;
  template_id?: number;
  inspiration_ad_id?: number;
  account_id?: number;
  variation_count?: number;
}

async function loadBrandContext(userId: number, brandConfigId?: number, accountId?: number): Promise<string> {
  let config: any = null;

  // 1. Explicit brand config
  if (brandConfigId) {
    const result = await pool.query('SELECT * FROM brand_configs WHERE id = $1 AND user_id = $2', [brandConfigId, userId]);
    if (result.rows.length > 0) config = result.rows[0];
  }

  // 2. Account-linked brand config
  if (!config && accountId) {
    const result = await pool.query(
      `SELECT bc.* FROM brand_configs bc
       JOIN accounts a ON a.brand_config_id = bc.id
       WHERE a.id = $1 AND a.user_id = $2`,
      [accountId, userId]
    );
    if (result.rows.length > 0) config = result.rows[0];
  }

  // 3. User default
  if (!config) {
    const result = await pool.query(
      'SELECT * FROM brand_configs WHERE user_id = $1 AND is_default = true LIMIT 1',
      [userId]
    );
    if (result.rows.length > 0) config = result.rows[0];
  }

  if (!config) return '';

  const fields = ['brand_name', 'logo_url', 'brand_colors', 'tone_of_voice', 'target_audience', 'usp', 'guidelines'];
  return fields.filter(f => config[f]).map(f => `${f}: ${config[f]}`).join('\n');
}

async function loadTemplateContext(templateId: number): Promise<string> {
  const result = await pool.query('SELECT * FROM creative_templates WHERE id = $1', [templateId]);
  if (result.rows.length === 0) return '';
  const tmpl = result.rows[0];

  // Increment usage count
  await pool.query('UPDATE creative_templates SET usage_count = usage_count + 1 WHERE id = $1', [templateId]);

  let ctx = `Template: ${tmpl.name}\n`;
  if (tmpl.structure && Object.keys(tmpl.structure).length > 0) {
    ctx += `Structure:\n${JSON.stringify(tmpl.structure, null, 2)}\n`;
  }
  if (tmpl.variable_slots?.length > 0) {
    ctx += `Variable slots: ${tmpl.variable_slots.map((s: any) => s.name || s).join(', ')}\n`;
  }
  return ctx;
}

async function loadInspirationContext(adId: number, userId: number): Promise<string> {
  // Try saved_creatives first
  const saved = await pool.query(
    'SELECT * FROM saved_creatives WHERE id = $1 AND user_id = $2',
    [adId, userId]
  );
  if (saved.rows.length > 0) {
    const s = saved.rows[0];
    return `Inspiration ad:\nHeadline: ${s.headline || ''}\nBody: ${s.body_text || ''}\nCTA: ${s.cta || ''}\nPlatform: ${s.platform || ''}`;
  }

  // Try generated_creatives
  const gen = await pool.query(
    'SELECT * FROM generated_creatives WHERE id = $1 AND user_id = $2',
    [adId, userId]
  );
  if (gen.rows.length > 0) {
    const content = gen.rows[0].content;
    return `Inspiration creative:\n${JSON.stringify(content, null, 2)}`;
  }

  return '';
}

async function loadTopPerformingContext(userId: number): Promise<string> {
  const result = await pool.query(`
    SELECT ct.hook_type, ct.creative_angle, ct.messaging_theme, ct.cta_style,
           SUM(cmd.revenue) as total_revenue, AVG(cmd.roas) as avg_roas
    FROM creative_tags ct
    JOIN ad_creatives ac ON ac.id = ct.creative_id
    JOIN creative_metrics_daily cmd ON cmd.creative_id = ct.creative_id
    WHERE ac.user_id = $1 AND cmd.date >= NOW() - INTERVAL '30 days'
    GROUP BY ct.hook_type, ct.creative_angle, ct.messaging_theme, ct.cta_style
    ORDER BY avg_roas DESC NULLS LAST
    LIMIT 5
  `, [userId]);

  if (result.rows.length === 0) return '';

  return 'Top-performing creative attributes (last 30 days):\n' +
    result.rows.map(r =>
      `- Hook: ${r.hook_type || 'N/A'}, Angle: ${r.creative_angle || 'N/A'}, Theme: ${r.messaging_theme || 'N/A'}, CTA: ${r.cta_style || 'N/A'} (ROAS: ${Number(r.avg_roas).toFixed(2)})`
    ).join('\n');
}

function buildPrompt(params: GenerateParams, brandContext: string, templateContext: string, inspirationContext: string, performanceContext: string): string {
  const count = params.variation_count || 3;
  const platformRules: Record<string, string> = {
    meta: 'Primary text: max 125 chars for best performance (up to 2200 allowed). Headline: max 40 chars. Description: max 30 chars.',
    instagram: 'Caption: max 125 chars visible before "more". Hashtags: 3-5 relevant ones.',
    tiktok: 'Keep copy punchy and conversational. Hook in first 3 words.',
    google: 'Headline 1: max 30 chars. Headline 2: max 30 chars. Description: max 90 chars.',
    general: 'Follow platform best practices for ad copy.',
  };

  let prompt = `You are an expert direct-response advertising copywriter. Generate ${count} ad copy variations.\n\n`;
  prompt += `Creative type: ${params.creative_type}\n`;
  prompt += `Platform: ${params.platform}\n`;
  prompt += `Brief: ${params.brief}\n\n`;

  if (brandContext) prompt += `Brand context:\n${brandContext}\n\n`;
  if (templateContext) prompt += `${templateContext}\n\n`;
  if (inspirationContext) prompt += `${inspirationContext}\n\n`;
  if (performanceContext) prompt += `${performanceContext}\n\n`;

  prompt += `Platform rules: ${platformRules[params.platform] || platformRules.general}\n\n`;

  prompt += `Return exactly ${count} variations as a JSON array. Each variation should be an object with these fields:
- "headline": string (main headline)
- "primary_text": string (body copy / primary text)
- "description": string (short description line)
- "cta": string (call to action text)
- "hook": string (the hook/angle used)
- "rationale": string (brief explanation of why this variation works)

Return ONLY the JSON array, no markdown code fences or other text.`;

  return prompt;
}

export async function generateAdCopy(params: GenerateParams): Promise<any> {
  const [brandContext, templateContext, inspirationContext, performanceContext] = await Promise.all([
    loadBrandContext(params.userId, params.brand_config_id, params.account_id),
    params.template_id ? loadTemplateContext(params.template_id) : Promise.resolve(''),
    params.inspiration_ad_id ? loadInspirationContext(params.inspiration_ad_id, params.userId) : Promise.resolve(''),
    loadTopPerformingContext(params.userId),
  ]);

  const prompt = buildPrompt(params, brandContext, templateContext, inspirationContext, performanceContext);

  // Create generation job
  const jobRes = await pool.query(
    `INSERT INTO generation_jobs (user_id, job_type, status, input_params)
     VALUES ($1, $2, 'running', $3) RETURNING id`,
    [params.userId, params.creative_type, JSON.stringify(params)]
  );
  const jobId = jobRes.rows[0].id;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const text = textContent ? textContent.text : '';
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    let variations;
    try {
      variations = JSON.parse(text);
    } catch {
      // Try to extract JSON from response
      const match = text.match(/\[[\s\S]*\]/);
      variations = match ? JSON.parse(match[0]) : [{ headline: text, primary_text: '', description: '', cta: '', hook: '', rationale: 'Raw response' }];
    }

    const content = { variations, brand_context_used: !!brandContext, brief: params.brief };

    // Save to generated_creatives
    const creativeRes = await pool.query(
      `INSERT INTO generated_creatives (user_id, creative_type, platform, content, inspiration_ad_id, brand_vault_used, template_id, brand_config_id, model_used, tokens_used, generation_job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [params.userId, params.creative_type, params.platform, JSON.stringify(content), params.inspiration_ad_id || null, !!brandContext, params.template_id || null, params.brand_config_id || null, 'claude-sonnet-4-20250514', tokensUsed, jobId]
    );

    // Update job
    await pool.query(
      `UPDATE generation_jobs SET status = 'completed', output = $1, model_used = 'claude-sonnet-4-20250514', tokens_used = $2, completed_at = NOW() WHERE id = $3`,
      [JSON.stringify(content), tokensUsed, jobId]
    );

    return creativeRes.rows[0];
  } catch (err: any) {
    await pool.query(
      `UPDATE generation_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [err.message, jobId]
    );
    throw err;
  }
}

export async function generateAdCopyStream(params: GenerateParams, res: Response): Promise<void> {
  const [brandContext, templateContext, inspirationContext, performanceContext] = await Promise.all([
    loadBrandContext(params.userId, params.brand_config_id, params.account_id),
    params.template_id ? loadTemplateContext(params.template_id) : Promise.resolve(''),
    params.inspiration_ad_id ? loadInspirationContext(params.inspiration_ad_id, params.userId) : Promise.resolve(''),
    loadTopPerformingContext(params.userId),
  ]);

  const prompt = buildPrompt(params, brandContext, templateContext, inspirationContext, performanceContext);

  // Create generation job
  const jobRes = await pool.query(
    `INSERT INTO generation_jobs (user_id, job_type, status, input_params)
     VALUES ($1, $2, 'running', $3) RETURNING id`,
    [params.userId, params.creative_type, JSON.stringify(params)]
  );
  const jobId = jobRes.rows[0].id;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let fullText = '';
  let tokensUsed = 0;

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
    });

    const finalMessage = await stream.finalMessage();
    tokensUsed = (finalMessage.usage?.input_tokens || 0) + (finalMessage.usage?.output_tokens || 0);

    // Parse and save
    let variations;
    try {
      variations = JSON.parse(fullText);
    } catch {
      const match = fullText.match(/\[[\s\S]*\]/);
      variations = match ? JSON.parse(match[0]) : [];
    }

    const content = { variations, brand_context_used: !!brandContext, brief: params.brief };

    const creativeRes = await pool.query(
      `INSERT INTO generated_creatives (user_id, creative_type, platform, content, inspiration_ad_id, brand_vault_used, template_id, brand_config_id, model_used, tokens_used, generation_job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [params.userId, params.creative_type, params.platform, JSON.stringify(content), params.inspiration_ad_id || null, !!brandContext, params.template_id || null, params.brand_config_id || null, 'claude-sonnet-4-20250514', tokensUsed, jobId]
    );

    await pool.query(
      `UPDATE generation_jobs SET status = 'completed', output = $1, model_used = 'claude-sonnet-4-20250514', tokens_used = $2, completed_at = NOW() WHERE id = $3`,
      [JSON.stringify(content), tokensUsed, jobId]
    );

    res.write(`data: ${JSON.stringify({ type: 'done', creative: creativeRes.rows[0] })}\n\n`);
  } catch (err: any) {
    await pool.query(
      `UPDATE generation_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [err.message, jobId]
    );
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
  }

  res.end();
}

export async function generateVariations(creativeId: number, userId: number, count: number = 3): Promise<any> {
  const result = await pool.query('SELECT * FROM generated_creatives WHERE id = $1 AND user_id = $2', [creativeId, userId]);
  if (result.rows.length === 0) throw new Error('Creative not found');

  const original = result.rows[0];
  const content = original.content;

  return generateAdCopy({
    userId,
    creative_type: original.creative_type,
    platform: original.platform,
    brief: `Create ${count} variations of this ad. Original: ${JSON.stringify(content.variations?.[0] || content)}`,
    brand_config_id: original.brand_config_id,
    template_id: original.template_id,
    variation_count: count,
  });
}

export async function generateABTestSuggestions(creativeId: number, userId: number): Promise<any> {
  const result = await pool.query('SELECT * FROM generated_creatives WHERE id = $1 AND user_id = $2', [creativeId, userId]);
  if (result.rows.length === 0) throw new Error('Creative not found');

  const original = result.rows[0];
  const content = original.content;

  const prompt = `You are an A/B testing expert for paid advertising. Analyze this ad creative and suggest 3 A/B test variations.

Original ad: ${JSON.stringify(content.variations?.[0] || content)}

For each suggestion, explain:
1. What element to test (headline, hook, CTA, tone, etc.)
2. The variation
3. Your hypothesis for why it might outperform

Return as a JSON array of objects with fields: "test_element", "original", "variation", "hypothesis", "headline", "primary_text", "description", "cta"

Return ONLY the JSON array.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  const text = textContent ? textContent.text : '';
  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  let suggestions;
  try {
    suggestions = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    suggestions = match ? JSON.parse(match[0]) : [];
  }

  // Track tokens
  await pool.query(
    `INSERT INTO generation_jobs (user_id, job_type, status, input_params, output, model_used, tokens_used, completed_at)
     VALUES ($1, 'ab_test', 'completed', $2, $3, 'claude-sonnet-4-20250514', $4, NOW())`,
    [userId, JSON.stringify({ creative_id: creativeId }), JSON.stringify(suggestions), tokensUsed]
  );

  return suggestions;
}

export async function extractTemplate(creativeId: number, userId: number): Promise<any> {
  // Try generated_creatives first
  let source: any = null;
  const genResult = await pool.query('SELECT * FROM generated_creatives WHERE id = $1 AND user_id = $2', [creativeId, userId]);
  if (genResult.rows.length > 0) {
    source = genResult.rows[0];
  }

  // Try saved_creatives
  if (!source) {
    const savedResult = await pool.query('SELECT * FROM saved_creatives WHERE id = $1 AND user_id = $2', [creativeId, userId]);
    if (savedResult.rows.length > 0) source = savedResult.rows[0];
  }

  if (!source) throw new Error('Creative not found');

  const content = source.content || source;
  const prompt = `Analyze this ad creative and extract a reusable template structure with variable slots.

Creative: ${JSON.stringify(content)}

Return a JSON object with:
- "name": suggested template name
- "description": what this template is good for
- "structure": the template structure with placeholder variables like {{product_name}}, {{benefit}}, {{price}}, etc.
- "variable_slots": array of objects with "name", "description", "example_value", "type" (text/number/select)
- "creative_type": type of creative (ad_copy, full_ad, headline, etc.)
- "platform": best platform for this template

Return ONLY the JSON object.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  const text = textContent ? textContent.text : '';
  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  let templateData;
  try {
    templateData = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    templateData = match ? JSON.parse(match[0]) : { name: 'Extracted Template', structure: {}, variable_slots: [] };
  }

  // Save to creative_templates
  const result = await pool.query(
    `INSERT INTO creative_templates (user_id, name, description, structure, variable_slots, source_creative_id, platform, creative_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      userId,
      templateData.name || 'Extracted Template',
      templateData.description || '',
      JSON.stringify(templateData.structure || {}),
      JSON.stringify(templateData.variable_slots || []),
      creativeId,
      templateData.platform || source.platform || 'meta',
      templateData.creative_type || source.creative_type || 'ad_copy',
    ]
  );

  // Track tokens
  await pool.query(
    `INSERT INTO generation_jobs (user_id, job_type, status, input_params, output, model_used, tokens_used, completed_at)
     VALUES ($1, 'extract_template', 'completed', $2, $3, 'claude-haiku-4-5-20251001', $4, NOW())`,
    [userId, JSON.stringify({ creative_id: creativeId }), JSON.stringify(templateData), tokensUsed]
  );

  return result.rows[0];
}
