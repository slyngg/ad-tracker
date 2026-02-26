import pool from '../db';
import { decrypt } from './oauth-providers';
import {
  createCampaign,
  createAdSet,
  createAdCreative,
  createAd,
  uploadAdImage,
  getAdAccountPages,
} from './meta-api';
import {
  publishTikTokCampaignDraft,
  activateTikTokCampaign,
  validateTikTokDraft,
} from './tiktok-publisher';
import {
  publishNewsBreakCampaignDraft,
  activateNewsBreakCampaign,
  validateNewsBreakDraft,
} from './newsbreak-publisher';

async function getAccessToken(userId: number): Promise<string> {
  const result = await pool.query(
    `SELECT credentials FROM integration_configs
     WHERE user_id = $1 AND platform = 'meta' AND status = 'connected' AND connection_method = 'oauth'`,
    [userId]
  );
  if (result.rows.length === 0) throw new Error('No connected Meta account found');
  const creds = result.rows[0].credentials;
  if (!creds?.access_token_encrypted) throw new Error('No access token available');
  return decrypt(creds.access_token_encrypted);
}

function getAccountId(account: any): string {
  const pid = account.platform_account_id;
  if (!pid) throw new Error('Account has no platform_account_id');
  return pid.startsWith('act_') ? pid : `act_${pid}`;
}

export interface PublishResult {
  success: boolean;
  meta_campaign_id?: string;
  adsets: { local_id: number; meta_id?: string; error?: string }[];
  ads: { local_id: number; meta_id?: string; error?: string }[];
  error?: string;
}

export async function publishCampaignDraft(draftId: number, userId: number): Promise<PublishResult> {
  const result: PublishResult = { success: false, adsets: [], ads: [] };

  // Atomic compare-and-swap: only transition from 'draft' or 'failed' to 'publishing'
  const draftRes = await pool.query(
    `UPDATE campaign_drafts SET status = 'publishing', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'failed')
     RETURNING *`,
    [draftId, userId]
  );
  if (draftRes.rows.length === 0) {
    // Check if it exists at all to give a better error
    const check = await pool.query(
      'SELECT status FROM campaign_drafts WHERE id = $1 AND user_id = $2',
      [draftId, userId]
    );
    if (check.rows.length === 0) throw new Error('Draft not found');
    const status = check.rows[0].status;
    if (status === 'published') throw new Error('Draft already published');
    if (status === 'publishing') throw new Error('Draft is currently being published');
    throw new Error(`Cannot publish draft with status: ${status}`);
  }
  const draft = draftRes.rows[0];

  // Load account
  const accountRes = await pool.query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2', [draft.account_id, userId]);
  if (accountRes.rows.length === 0) throw new Error('Account not found');
  const account = accountRes.rows[0];
  const actId = getAccountId(account);

  // Resolve token
  const accessToken = await getAccessToken(userId);

  // Load adsets + ads
  const adsetsRes = await pool.query('SELECT * FROM campaign_adsets WHERE draft_id = $1 ORDER BY id', [draftId]);
  const adsets = adsetsRes.rows;

  // Resolve page_id
  let pageId: string | undefined;
  try {
    const pages = await getAdAccountPages(actId, accessToken);
    if (pages.length > 0) pageId = pages[0].id;
  } catch { /* page resolution optional for some objectives */ }

  try {
    // 1. Create campaign on Meta
    const metaCampaign = await createCampaign(actId, {
      name: draft.name,
      objective: draft.objective,
      status: 'PAUSED',
      special_ad_categories: draft.special_ad_categories || [],
    }, accessToken);

    const metaCampaignId = metaCampaign.id;
    result.meta_campaign_id = metaCampaignId;
    await pool.query(
      'UPDATE campaign_drafts SET meta_campaign_id = $1, updated_at = NOW() WHERE id = $2',
      [metaCampaignId, draftId]
    );

    // 2. Create ad sets
    for (const adset of adsets) {
      try {
        const budgetParams: any = {};
        if (adset.budget_type === 'daily') {
          budgetParams.daily_budget = adset.budget_cents;
        } else {
          budgetParams.lifetime_budget = adset.budget_cents;
        }

        const metaAdSet = await createAdSet(actId, {
          name: adset.name,
          campaign_id: metaCampaignId,
          targeting: adset.targeting || {},
          ...budgetParams,
          bid_strategy: adset.bid_strategy,
          start_time: adset.schedule_start?.toISOString?.() || adset.schedule_start,
          end_time: adset.schedule_end?.toISOString?.() || adset.schedule_end,
          status: 'PAUSED',
        }, accessToken);

        const metaAdSetId = metaAdSet.id;
        await pool.query(
          "UPDATE campaign_adsets SET meta_adset_id = $1, status = 'published', updated_at = NOW() WHERE id = $2",
          [metaAdSetId, adset.id]
        );
        result.adsets.push({ local_id: adset.id, meta_id: metaAdSetId });

        // 3. Create ads for this ad set
        const adsRes = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1 ORDER BY id', [adset.id]);
        for (const ad of adsRes.rows) {
          try {
            const cc = ad.creative_config || {};

            // Upload image if media_upload_id provided
            let imageHash: string | undefined;
            if (ad.media_upload_id) {
              const mediaRes = await pool.query('SELECT * FROM campaign_media_uploads WHERE id = $1 AND user_id = $2', [ad.media_upload_id, userId]);
              if (mediaRes.rows.length > 0) {
                const media = mediaRes.rows[0];
                if (media.meta_image_hash) {
                  imageHash = media.meta_image_hash;
                } else if (media.file_path) {
                  const fs = await import('fs');
                  const buf = fs.readFileSync(media.file_path);
                  const uploaded = await uploadAdImage(actId, buf, media.filename, accessToken);
                  imageHash = uploaded.hash;
                  await pool.query(
                    "UPDATE campaign_media_uploads SET meta_image_hash = $1, status = 'ready' WHERE id = $2",
                    [imageHash, media.id]
                  );
                }
              }
            }

            // Build object_story_spec
            const storySpec: any = {
              page_id: cc.page_id || pageId,
              link_data: {
                message: cc.primary_text || '',
                link: cc.link_url || 'https://example.com',
                name: cc.headline || '',
                description: cc.description || '',
                call_to_action: { type: cc.cta || 'LEARN_MORE' },
              },
            };
            if (imageHash) {
              storySpec.link_data.image_hash = imageHash;
            }

            // Create ad creative on Meta
            const metaCreative = await createAdCreative(actId, {
              name: `${ad.name} Creative`,
              object_story_spec: storySpec,
            }, accessToken);

            // Create ad on Meta
            const metaAd = await createAd(actId, {
              name: ad.name,
              adset_id: metaAdSetId,
              creative_id: metaCreative.id,
              status: 'PAUSED',
            }, accessToken);

            await pool.query(
              "UPDATE campaign_ads SET meta_ad_id = $1, meta_creative_id = $2, status = 'published', updated_at = NOW() WHERE id = $3",
              [metaAd.id, metaCreative.id, ad.id]
            );
            result.ads.push({ local_id: ad.id, meta_id: metaAd.id });
          } catch (err: any) {
            const errorMsg = err.message || 'Unknown error';
            await pool.query(
              "UPDATE campaign_ads SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
              [errorMsg, ad.id]
            );
            result.ads.push({ local_id: ad.id, error: errorMsg });
          }
        }
      } catch (err: any) {
        const errorMsg = err.message || 'Unknown error';
        await pool.query(
          "UPDATE campaign_adsets SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
          [errorMsg, adset.id]
        );
        result.adsets.push({ local_id: adset.id, error: errorMsg });
      }
    }

    // Check if everything succeeded
    const hasFailures = result.adsets.some(a => a.error) || result.ads.some(a => a.error);
    if (hasFailures) {
      await pool.query(
        "UPDATE campaign_drafts SET status = 'failed', last_error = 'Some entities failed to publish', updated_at = NOW() WHERE id = $1",
        [draftId]
      );
    } else {
      await pool.query(
        "UPDATE campaign_drafts SET status = 'published', last_error = NULL, updated_at = NOW() WHERE id = $1",
        [draftId]
      );
      result.success = true;
    }
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error';
    await pool.query(
      "UPDATE campaign_drafts SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
      [errorMsg, draftId]
    );
    result.error = errorMsg;
  }

  return result;
}

export async function activateCampaign(draftId: number, userId: number): Promise<void> {
  const { updateCampaignStatus } = await import('./meta-api');
  const draftRes = await pool.query(
    "SELECT * FROM campaign_drafts WHERE id = $1 AND user_id = $2 AND status = 'published'",
    [draftId, userId]
  );
  if (draftRes.rows.length === 0) throw new Error('Published draft not found');
  const draft = draftRes.rows[0];
  if (!draft.meta_campaign_id) throw new Error('No Meta campaign ID');

  const accessToken = await getAccessToken(userId);
  await updateCampaignStatus(draft.meta_campaign_id, 'ACTIVE', accessToken);
}

export async function validateDraft(draftId: number, userId: number): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const draftRes = await pool.query('SELECT * FROM campaign_drafts WHERE id = $1 AND user_id = $2', [draftId, userId]);
  if (draftRes.rows.length === 0) return { valid: false, errors: ['Draft not found'] };
  const draft = draftRes.rows[0];

  if (!draft.account_id) errors.push('No ad account selected');
  if (!draft.name?.trim()) errors.push('Campaign name is required');
  if (!draft.objective) errors.push('Campaign objective is required');

  const adsetsRes = await pool.query('SELECT * FROM campaign_adsets WHERE draft_id = $1', [draftId]);
  if (adsetsRes.rows.length === 0) errors.push('At least one ad set is required');

  for (const adset of adsetsRes.rows) {
    if (!adset.name?.trim()) errors.push(`Ad set ${adset.id}: name is required`);
    if (adset.budget_cents < 100) errors.push(`Ad set "${adset.name}": budget must be at least $1.00`);

    const targeting = adset.targeting || {};
    if (!targeting.geo_locations?.countries?.length && !targeting.geo_locations?.regions?.length) {
      errors.push(`Ad set "${adset.name}": at least one geo target required`);
    }

    const adsRes = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1', [adset.id]);
    if (adsRes.rows.length === 0) errors.push(`Ad set "${adset.name}": at least one ad is required`);

    for (const ad of adsRes.rows) {
      if (!ad.name?.trim()) errors.push(`Ad in "${adset.name}": name is required`);
      const cc = ad.creative_config || {};
      if (!cc.primary_text?.trim()) errors.push(`Ad "${ad.name}": primary text is required`);
      if (!cc.link_url?.trim()) errors.push(`Ad "${ad.name}": link URL is required`);
    }
  }

  // Check Meta connection
  try {
    await getAccessToken(userId);
  } catch {
    errors.push('No connected Meta account. Please connect via OAuth first.');
  }

  return { valid: errors.length === 0, errors };
}

// ── Platform-aware dispatchers ─────────────────────────────────

async function getDraftPlatform(draftId: number, userId: number): Promise<string> {
  const res = await pool.query(
    'SELECT platform FROM campaign_drafts WHERE id = $1 AND user_id = $2',
    [draftId, userId]
  );
  return res.rows[0]?.platform || 'meta';
}

export async function publishDraft(draftId: number, userId: number): Promise<PublishResult> {
  const platform = await getDraftPlatform(draftId, userId);
  switch (platform) {
    case 'meta':
      return publishCampaignDraft(draftId, userId);
    case 'tiktok': {
      const ttResult = await publishTikTokCampaignDraft(draftId, userId);
      return {
        success: ttResult.success,
        meta_campaign_id: ttResult.tiktok_campaign_id,
        adsets: ttResult.adsets.map(a => ({ local_id: a.local_id, meta_id: a.tiktok_id, error: a.error })),
        ads: ttResult.ads.map(a => ({ local_id: a.local_id, meta_id: a.tiktok_id, error: a.error })),
        error: ttResult.error,
      };
    }
    case 'newsbreak': {
      const nbResult = await publishNewsBreakCampaignDraft(draftId, userId);
      return {
        success: nbResult.success,
        meta_campaign_id: nbResult.newsbreak_campaign_id,
        adsets: nbResult.adsets.map(a => ({ local_id: a.local_id, meta_id: a.newsbreak_id, error: a.error })),
        ads: nbResult.ads.map(a => ({ local_id: a.local_id, meta_id: a.newsbreak_id, error: a.error })),
        error: nbResult.error,
      };
    }
    default:
      throw new Error(`Publishing not yet supported for ${platform}`);
  }
}

export async function activateDraftCampaign(draftId: number, userId: number): Promise<void> {
  const platform = await getDraftPlatform(draftId, userId);
  switch (platform) {
    case 'meta':
      return activateCampaign(draftId, userId);
    case 'tiktok':
      return activateTikTokCampaign(draftId, userId);
    case 'newsbreak':
      return activateNewsBreakCampaign(draftId, userId);
    default:
      throw new Error(`Activation not yet supported for ${platform}`);
  }
}

export async function validateDraftCampaign(draftId: number, userId: number): Promise<{ valid: boolean; errors: string[] }> {
  const platform = await getDraftPlatform(draftId, userId);
  switch (platform) {
    case 'meta':
      return validateDraft(draftId, userId);
    case 'tiktok':
      return validateTikTokDraft(draftId, userId);
    case 'newsbreak':
      return validateNewsBreakDraft(draftId, userId);
    default:
      throw new Error(`Validation not yet supported for ${platform}`);
  }
}
