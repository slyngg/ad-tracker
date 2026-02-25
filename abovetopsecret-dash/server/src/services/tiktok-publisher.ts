import pool from '../db';
import {
  getTikTokAuth,
  createTikTokCampaign,
  createTikTokAdGroup,
  uploadTikTokImage,
  createTikTokAd,
  updateTikTokCampaignStatus,
} from './tiktok-api';

export interface TikTokPublishResult {
  success: boolean;
  tiktok_campaign_id?: string;
  adsets: { local_id: number; tiktok_id?: string; error?: string }[];
  ads: { local_id: number; tiktok_id?: string; error?: string }[];
  error?: string;
}

// Map Optic objectives to TikTok objective types
const OBJECTIVE_MAP: Record<string, string> = {
  OUTCOME_SALES: 'CONVERSIONS',
  OUTCOME_TRAFFIC: 'TRAFFIC',
  OUTCOME_ENGAGEMENT: 'ENGAGEMENT',
  OUTCOME_LEADS: 'LEAD_GENERATION',
  OUTCOME_AWARENESS: 'REACH',
  OUTCOME_APP_PROMOTION: 'APP_PROMOTION',
  // TikTok-native objectives pass through
  CONVERSIONS: 'CONVERSIONS',
  TRAFFIC: 'TRAFFIC',
  REACH: 'REACH',
  VIDEO_VIEWS: 'VIDEO_VIEWS',
  LEAD_GENERATION: 'LEAD_GENERATION',
  APP_INSTALLS: 'APP_PROMOTION',
};

// Map Optic bid strategies to TikTok bid types
const BID_TYPE_MAP: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: 'BID_TYPE_NO_BID',
  LOWEST_COST_WITH_BID_CAP: 'BID_TYPE_CUSTOM',
  COST_CAP: 'BID_TYPE_CUSTOM',
  LOWEST_COST_WITH_MIN_ROAS: 'BID_TYPE_CUSTOM',
};

function mapOptimizationGoal(objective: string): string {
  switch (objective) {
    case 'CONVERSIONS': return 'CONVERT';
    case 'TRAFFIC': return 'CLICK';
    case 'REACH': return 'REACH';
    case 'VIDEO_VIEWS': return 'VIDEO_VIEW';
    case 'LEAD_GENERATION': return 'LEAD_GENERATION';
    case 'APP_PROMOTION': return 'INSTALL';
    default: return 'CLICK';
  }
}

export async function publishTikTokCampaignDraft(draftId: number, userId: number): Promise<TikTokPublishResult> {
  const result: TikTokPublishResult = { success: false, adsets: [], ads: [] };

  // Atomic compare-and-swap: only transition from 'draft' or 'failed' to 'publishing'
  const draftRes = await pool.query(
    `UPDATE campaign_drafts SET status = 'publishing', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'failed')
     RETURNING *`,
    [draftId, userId]
  );
  if (draftRes.rows.length === 0) {
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

  // Resolve TikTok auth
  const auth = await getTikTokAuth(userId);
  if (!auth) {
    await pool.query(
      "UPDATE campaign_drafts SET status = 'failed', last_error = 'No TikTok credentials configured', updated_at = NOW() WHERE id = $1",
      [draftId]
    );
    result.error = 'No TikTok credentials configured. Please connect TikTok via OAuth.';
    return result;
  }

  const adsetsRes = await pool.query('SELECT * FROM campaign_adsets WHERE draft_id = $1 ORDER BY id', [draftId]);
  const adsets = adsetsRes.rows;

  const tiktokObjective = OBJECTIVE_MAP[draft.objective] || 'TRAFFIC';

  try {
    // 1. Create TikTok campaign
    const ttCampaign = await createTikTokCampaign(
      auth.advertiserId,
      {
        campaign_name: draft.name,
        objective_type: tiktokObjective,
      },
      auth.accessToken
    );

    const tiktokCampaignId = ttCampaign.campaign_id;
    result.tiktok_campaign_id = tiktokCampaignId;
    await pool.query(
      'UPDATE campaign_drafts SET tiktok_campaign_id = $1, updated_at = NOW() WHERE id = $2',
      [tiktokCampaignId, draftId]
    );

    // 2. Create ad groups (ad sets)
    for (const adset of adsets) {
      try {
        const budgetMode = adset.budget_type === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL';
        // TikTok budget is in dollars (not cents)
        const budget = Math.max(20, adset.budget_cents / 100);
        const bidType = BID_TYPE_MAP[adset.bid_strategy] || 'BID_TYPE_NO_BID';

        const ttAdGroup = await createTikTokAdGroup(
          auth.advertiserId,
          {
            campaign_id: tiktokCampaignId,
            adgroup_name: adset.name,
            budget,
            budget_mode: budgetMode,
            schedule_type: adset.schedule_end ? 'SCHEDULE_START_END' : 'SCHEDULE_FROM_NOW',
            schedule_start_time: adset.schedule_start || undefined,
            schedule_end_time: adset.schedule_end || undefined,
            optimization_goal: mapOptimizationGoal(tiktokObjective),
            bid_type: bidType,
          },
          auth.accessToken
        );

        const tiktokAdGroupId = ttAdGroup.adgroup_id;
        await pool.query(
          "UPDATE campaign_adsets SET tiktok_adgroup_id = $1, status = 'published', updated_at = NOW() WHERE id = $2",
          [tiktokAdGroupId, adset.id]
        );
        result.adsets.push({ local_id: adset.id, tiktok_id: tiktokAdGroupId });

        // 3. Create ads for this ad group
        const adsRes = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1 ORDER BY id', [adset.id]);
        for (const ad of adsRes.rows) {
          try {
            const cc = ad.creative_config || {};
            let imageIds: string[] | undefined;

            // Upload image if media_upload_id provided
            if (ad.media_upload_id) {
              const mediaRes = await pool.query('SELECT * FROM campaign_media_uploads WHERE id = $1 AND user_id = $2', [ad.media_upload_id, userId]);
              if (mediaRes.rows.length > 0) {
                const media = mediaRes.rows[0];
                // For TikTok we need a URL — if we have a local file, we'd need a public URL
                // For now, use image_url from creative_config if available
                const imageUrl = cc.image_url || media.public_url;
                if (imageUrl) {
                  const uploaded = await uploadTikTokImage(auth.advertiserId, imageUrl, auth.accessToken);
                  imageIds = [uploaded.image_id];
                }
              }
            }

            const ttAd = await createTikTokAd(
              auth.advertiserId,
              {
                adgroup_id: tiktokAdGroupId,
                ad_name: ad.name,
                ad_text: cc.primary_text || cc.headline || '',
                image_ids: imageIds,
                landing_page_url: cc.link_url,
              },
              auth.accessToken
            );

            await pool.query(
              "UPDATE campaign_ads SET tiktok_ad_id = $1, status = 'published', updated_at = NOW() WHERE id = $2",
              [ttAd.ad_id, ad.id]
            );
            result.ads.push({ local_id: ad.id, tiktok_id: ttAd.ad_id });
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

export async function activateTikTokCampaign(draftId: number, userId: number): Promise<void> {
  const draftRes = await pool.query(
    "SELECT * FROM campaign_drafts WHERE id = $1 AND user_id = $2 AND status = 'published'",
    [draftId, userId]
  );
  if (draftRes.rows.length === 0) throw new Error('Published draft not found');
  const draft = draftRes.rows[0];
  if (!draft.tiktok_campaign_id) throw new Error('No TikTok campaign ID');

  await updateTikTokCampaignStatus(draft.tiktok_campaign_id, 'ENABLE', userId);
}

export async function validateTikTokDraft(draftId: number, userId: number): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const draftRes = await pool.query('SELECT * FROM campaign_drafts WHERE id = $1 AND user_id = $2', [draftId, userId]);
  if (draftRes.rows.length === 0) return { valid: false, errors: ['Draft not found'] };
  const draft = draftRes.rows[0];

  if (!draft.account_id) errors.push('No ad account selected');
  if (!draft.name?.trim()) errors.push('Campaign name is required');
  if (!draft.objective) errors.push('Campaign objective is required');

  const adsetsRes = await pool.query('SELECT * FROM campaign_adsets WHERE draft_id = $1', [draftId]);
  if (adsetsRes.rows.length === 0) errors.push('At least one ad group is required');

  for (const adset of adsetsRes.rows) {
    if (!adset.name?.trim()) errors.push(`Ad group ${adset.id}: name is required`);
    // TikTok minimum daily budget is $20
    if (adset.budget_type === 'daily' && adset.budget_cents < 2000) {
      errors.push(`Ad group "${adset.name}": TikTok minimum daily budget is $20.00`);
    }

    const adsRes = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1', [adset.id]);
    if (adsRes.rows.length === 0) errors.push(`Ad group "${adset.name}": at least one ad is required`);

    for (const ad of adsRes.rows) {
      if (!ad.name?.trim()) errors.push(`Ad in "${adset.name}": name is required`);
    }
  }

  // Check TikTok connection
  const auth = await getTikTokAuth(userId);
  if (!auth) {
    errors.push('No connected TikTok account. Please connect via OAuth first.');
  }

  return { valid: errors.length === 0, errors };
}
