import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import pool from '../db';
import { searchAdLibrary as metaSearchAdLibrary } from './meta-api';
import { searchTikTokAdLibrary, getTikTokResearchAuth } from './tiktok-api';
import { decrypt } from './oauth-providers';
import { getSetting } from './settings';

const anthropic = new Anthropic();

async function getMetaAccessToken(userId: number): Promise<string> {
  // Try OAuth first
  const result = await pool.query(
    `SELECT credentials FROM integration_configs
     WHERE user_id = $1 AND platform = 'meta' AND status = 'connected' AND connection_method = 'oauth'`,
    [userId]
  );
  if (result.rows.length > 0) {
    const creds = result.rows[0].credentials;
    if (creds?.access_token_encrypted) return decrypt(creds.access_token_encrypted);
  }

  // Fall back to manual token from settings
  const manualToken = await getSetting('fb_access_token', userId);
  if (manualToken) return manualToken;

  throw new Error('No connected Meta account. Connect via OAuth or enter an access token in Settings > Connections.');
}

function parseImpressionRange(impressions: any): { lower: number | null; upper: number | null } {
  if (!impressions) return { lower: null, upper: null };
  if (typeof impressions === 'object') {
    return { lower: impressions.lower_bound || null, upper: impressions.upper_bound || null };
  }
  return { lower: null, upper: null };
}

function parseSpendRange(spend: any): { lower: number | null; upper: number | null } {
  if (!spend) return { lower: null, upper: null };
  if (typeof spend === 'object') {
    return { lower: spend.lower_bound ? parseFloat(spend.lower_bound) : null, upper: spend.upper_bound ? parseFloat(spend.upper_bound) : null };
  }
  return { lower: null, upper: null };
}

export async function searchAndCacheAdLibrary(
  userId: number,
  params: {
    platform?: string;
    search_terms?: string;
    page_id?: string;
    country: string;
    ad_active_status?: string;
    ad_type?: string;
    limit?: number;
    after?: string;
  }
): Promise<{ data: any[]; paging?: { after?: string } }> {
  const platform = params.platform || 'meta';

  if (platform === 'tiktok') {
    return searchAndCacheTikTok(userId, params);
  }

  return searchAndCacheMeta(userId, params);
}

async function searchAndCacheMeta(
  userId: number,
  params: {
    search_terms?: string;
    page_id?: string;
    country: string;
    ad_active_status?: string;
    ad_type?: string;
    limit?: number;
    after?: string;
  }
): Promise<{ data: any[]; paging?: { after?: string } }> {
  const accessToken = await getMetaAccessToken(userId);

  const searchParams: any = {
    ad_reached_countries: [params.country || 'US'],
    limit: params.limit || 25,
  };
  if (params.search_terms) searchParams.search_terms = params.search_terms;
  if (params.page_id) searchParams.search_page_ids = [params.page_id];
  if (params.ad_active_status) searchParams.ad_active_status = params.ad_active_status;
  if (params.ad_type) searchParams.ad_type = params.ad_type;
  if (params.after) searchParams.after = params.after;

  const result = await metaSearchAdLibrary(searchParams, accessToken);

  // Log search
  await pool.query(
    `INSERT INTO ad_library_searches (user_id, search_type, search_terms, page_id, country, filters, results_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      params.page_id ? 'page' : 'keyword',
      params.search_terms || null,
      params.page_id || null,
      params.country || 'US',
      JSON.stringify({ ad_active_status: params.ad_active_status, ad_type: params.ad_type }),
      result.data?.length || 0,
    ]
  );

  // Cache results
  const cached: any[] = [];
  for (const ad of (result.data || [])) {
    const impr = parseImpressionRange(ad.impressions);
    const spnd = parseSpendRange(ad.spend);

    try {
      const upsertRes = await pool.query(
        `INSERT INTO ad_library_cache (user_id, meta_ad_id, page_id, page_name, ad_creative_bodies, ad_creative_link_titles, ad_creative_link_descriptions, ad_creative_link_captions, ad_snapshot_url, impressions_lower, impressions_upper, spend_lower, spend_upper, currency, ad_delivery_start, ad_delivery_stop, ad_creation_time, publisher_platforms, bylines, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         ON CONFLICT (user_id, meta_ad_id) DO UPDATE SET
           ad_creative_bodies = EXCLUDED.ad_creative_bodies,
           ad_creative_link_titles = EXCLUDED.ad_creative_link_titles,
           impressions_lower = COALESCE(EXCLUDED.impressions_lower, ad_library_cache.impressions_lower),
           impressions_upper = COALESCE(EXCLUDED.impressions_upper, ad_library_cache.impressions_upper),
           spend_lower = COALESCE(EXCLUDED.spend_lower, ad_library_cache.spend_lower),
           spend_upper = COALESCE(EXCLUDED.spend_upper, ad_library_cache.spend_upper),
           ad_delivery_stop = EXCLUDED.ad_delivery_stop,
           raw_data = EXCLUDED.raw_data
         RETURNING *`,
        [
          userId, ad.id, ad.page_id, ad.page_name,
          JSON.stringify(ad.ad_creative_bodies || []),
          JSON.stringify(ad.ad_creative_link_titles || []),
          JSON.stringify(ad.ad_creative_link_descriptions || []),
          JSON.stringify(ad.ad_creative_link_captions || []),
          ad.ad_snapshot_url || null,
          impr.lower, impr.upper,
          spnd.lower, spnd.upper,
          ad.currency || null,
          ad.ad_delivery_start_time || null,
          ad.ad_delivery_stop_time || null,
          ad.ad_creation_time || null,
          JSON.stringify(ad.publisher_platforms || []),
          ad.bylines || null,
          JSON.stringify(ad),
        ]
      );
      cached.push(upsertRes.rows[0]);
    } catch (err) {
      console.error('Error caching ad library result:', err);
    }
  }

  return {
    data: cached,
    paging: result.paging?.cursors?.after ? { after: result.paging.cursors.after } : undefined,
  };
}

async function searchAndCacheTikTok(
  userId: number,
  params: {
    search_terms?: string;
    country: string;
    limit?: number;
    after?: string;
  }
): Promise<{ data: any[]; paging?: { after?: string } }> {
  const accessToken = await getTikTokResearchAuth(userId);
  if (!accessToken) throw new Error('No TikTok Research API token configured. Add your TikTok Research API token in Integrations.');

  const countryMap: Record<string, string> = { US: 'US', CA: 'CA', GB: 'GB', AU: 'AU', DE: 'DE', FR: 'FR' };

  const result = await searchTikTokAdLibrary(
    {
      search_term: params.search_terms,
      country_code: countryMap[params.country] || 'US',
      max_count: params.limit || 20,
      cursor: params.after ? parseInt(params.after, 10) : undefined,
    },
    accessToken
  );

  // Log search
  await pool.query(
    `INSERT INTO ad_library_searches (user_id, search_type, search_terms, country, filters, results_count, platform)
     VALUES ($1, 'keyword', $2, $3, $4, $5, 'tiktok')`,
    [
      userId,
      params.search_terms || null,
      params.country || 'US',
      JSON.stringify({}),
      result.data?.length || 0,
    ]
  );

  // Cache TikTok results (normalize to same schema as Meta)
  const cached: any[] = [];
  for (const ad of (result.data || [])) {
    try {
      const adId = ad.id || ad.ad_id || `tt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const firstShown = ad.first_shown || null;
      const lastShown = ad.last_shown || null;
      const paidForBy = ad.paid_for_by || 'Unknown';

      // Extract creative content from TikTok ad data
      const bodies = ad.ad_text ? [ad.ad_text] : [];
      const titles = ad.ad_title ? [ad.ad_title] : [];
      const reach = ad.reach || {};

      const upsertRes = await pool.query(
        `INSERT INTO ad_library_cache (user_id, platform, meta_ad_id, page_id, page_name, ad_creative_bodies, ad_creative_link_titles, ad_creative_link_descriptions, ad_creative_link_captions, ad_snapshot_url, impressions_lower, impressions_upper, ad_delivery_start, ad_delivery_stop, ad_creation_time, publisher_platforms, raw_data)
         VALUES ($1, 'tiktok', $2, $3, $4, $5, $6, '[]', '[]', $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (user_id, platform, meta_ad_id) DO UPDATE SET
           ad_creative_bodies = EXCLUDED.ad_creative_bodies,
           ad_creative_link_titles = EXCLUDED.ad_creative_link_titles,
           impressions_lower = COALESCE(EXCLUDED.impressions_lower, ad_library_cache.impressions_lower),
           impressions_upper = COALESCE(EXCLUDED.impressions_upper, ad_library_cache.impressions_upper),
           ad_delivery_stop = EXCLUDED.ad_delivery_stop,
           raw_data = EXCLUDED.raw_data
         RETURNING *`,
        [
          userId, adId, paidForBy, paidForBy,
          JSON.stringify(bodies),
          JSON.stringify(titles),
          (ad.videos?.[0]?.cover_image_url || ad.images?.[0]?.image_url) || null,
          reach.unique_users_seen_lower_bound || null,
          reach.unique_users_seen_upper_bound || null,
          firstShown || null,
          lastShown || null,
          firstShown || null,
          JSON.stringify(['tiktok']),
          JSON.stringify(ad),
        ]
      );
      cached.push(upsertRes.rows[0]);
    } catch (err) {
      console.error('Error caching TikTok ad library result:', err);
    }
  }

  return {
    data: cached,
    paging: result.has_more && result.cursor != null ? { after: String(result.cursor) } : undefined,
  };
}

export async function getAdLibraryRateStatus(userId: number): Promise<{ calls_used: number; limit: number; reset_at: string }> {
  const result = await pool.query(
    `SELECT COUNT(*) as calls_used FROM ad_library_searches
     WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
    [userId]
  );
  const callsUsed = parseInt(result.rows[0].calls_used, 10);
  const resetAt = new Date(Date.now() + 3600000).toISOString(); // Approximate
  return { calls_used: callsUsed, limit: 200, reset_at: resetAt };
}

export async function syncFollowedBrands(userId: number): Promise<{ synced: number }> {
  const brands = await pool.query(
    `SELECT * FROM followed_brands
     WHERE user_id = $1 AND ad_library_sync_enabled = true`,
    [userId]
  );

  let synced = 0;
  for (const brand of brands.rows) {
    if (!brand.page_id) continue;
    try {
      const result = await searchAndCacheAdLibrary(userId, {
        page_id: brand.page_id,
        country: 'US',
        ad_active_status: 'ACTIVE',
        limit: 50,
      });
      synced += result.data.length;

      // Update last synced
      await pool.query(
        'UPDATE followed_brands SET ad_library_last_synced = NOW(), ad_library_ad_count = $1 WHERE id = $2',
        [result.data.length, brand.id]
      );
    } catch (err) {
      console.error(`Error syncing brand ${brand.name}:`, err);
    }
  }

  return { synced };
}

export async function computeTrends(userId: number, pageId: string): Promise<any> {
  // Get current active ads for this page
  const currentAds = await pool.query(
    `SELECT * FROM ad_library_cache
     WHERE user_id = $1 AND page_id = $2 AND (ad_delivery_stop IS NULL OR ad_delivery_stop > NOW())
     ORDER BY ad_creation_time DESC`,
    [userId, pageId]
  );

  // Get yesterday's trend for comparison
  const yesterdayTrend = await pool.query(
    `SELECT * FROM ad_library_trends
     WHERE user_id = $1 AND page_id = $2 AND date = CURRENT_DATE - 1`,
    [userId, pageId]
  );

  const activeCount = currentAds.rows.length;
  const previousCount = yesterdayTrend.rows[0]?.active_ad_count || 0;
  const newAds = Math.max(0, activeCount - previousCount);
  const stoppedAds = Math.max(0, previousCount - activeCount);

  // Simple theme extraction from creative bodies
  const allBodies = currentAds.rows.flatMap(r => r.ad_creative_bodies || []);
  const themes = extractThemes(allBodies);

  const pageName = currentAds.rows[0]?.page_name || pageId;

  const result = await pool.query(
    `INSERT INTO ad_library_trends (user_id, page_id, page_name, date, active_ad_count, new_ads, stopped_ads, themes)
     VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7)
     ON CONFLICT (user_id, page_id, date) DO UPDATE SET
       active_ad_count = EXCLUDED.active_ad_count,
       new_ads = EXCLUDED.new_ads,
       stopped_ads = EXCLUDED.stopped_ads,
       themes = EXCLUDED.themes
     RETURNING *`,
    [userId, pageId, pageName, activeCount, newAds, stoppedAds, JSON.stringify(themes)]
  );

  return result.rows[0];
}

function extractThemes(bodies: string[]): string[] {
  const wordFreq: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'each', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'don', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why']);

  for (const body of bodies) {
    const words = (body || '').toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

export async function analyzeCompetitorStrategy(userId: number, pageId: string, res: Response): Promise<void> {
  // Load cached ads for this competitor
  const ads = await pool.query(
    `SELECT ad_creative_bodies, ad_creative_link_titles, ad_creative_link_descriptions,
            ad_delivery_start, ad_delivery_stop, publisher_platforms, page_name
     FROM ad_library_cache
     WHERE user_id = $1 AND page_id = $2
     ORDER BY ad_creation_time DESC NULLS LAST
     LIMIT 50`,
    [userId, pageId]
  );

  if (ads.rows.length === 0) {
    res.status(404).json({ error: 'No cached ads found for this page. Run a search first.' });
    return;
  }

  // Load trends
  const trends = await pool.query(
    'SELECT * FROM ad_library_trends WHERE user_id = $1 AND page_id = $2 ORDER BY date DESC LIMIT 14',
    [userId, pageId]
  );

  const pageName = ads.rows[0]?.page_name || pageId;
  const adSummaries = ads.rows.map((a, i) => ({
    index: i + 1,
    bodies: a.ad_creative_bodies,
    titles: a.ad_creative_link_titles,
    descriptions: a.ad_creative_link_descriptions,
    platforms: a.publisher_platforms,
    running_since: a.ad_delivery_start,
    stopped: a.ad_delivery_stop,
  }));

  const prompt = `You are a competitive intelligence analyst for paid advertising. Analyze this competitor's Meta ad portfolio and provide strategic insights.

Competitor: ${pageName}
Total ads analyzed: ${ads.rows.length}

Trend data (last 14 days):
${trends.rows.map(t => `${t.date}: ${t.active_ad_count} active, ${t.new_ads} new, ${t.stopped_ads} stopped`).join('\n')}

Ad creative data:
${JSON.stringify(adSummaries, null, 2)}

Provide a comprehensive analysis including:
1. **Overall Strategy** - What's their advertising approach?
2. **Messaging Themes** - Key themes and angles they use
3. **Creative Patterns** - Common structures, hooks, CTAs
4. **Platform Focus** - Where they allocate most ads
5. **Testing Velocity** - How quickly they launch/kill ads
6. **Opportunities** - Gaps or weaknesses you can exploit
7. **Recommendations** - Specific actions to compete against them

Be specific and actionable. Reference specific ads when possible.`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      if (!aborted) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      }
    });

    if (!aborted) {
      await stream.finalMessage();
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } else {
      stream.abort();
    }
  } catch (err: any) {
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Analysis failed' })}\n\n`);
    }
  }

  res.end();
}
