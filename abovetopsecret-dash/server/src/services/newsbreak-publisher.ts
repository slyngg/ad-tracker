import pool from '../db';
import {
  getNewsBreakAuth,
  createNewsBreakCampaign,
  createNewsBreakAdGroup,
  createNewsBreakAd,
  updateNewsBreakCampaignStatus,
} from './newsbreak-api';

export interface NewsBreakPublishResult {
  success: boolean;
  newsbreak_campaign_id?: string;
  adsets: { local_id: number; newsbreak_id?: string; error?: string }[];
  ads: { local_id: number; newsbreak_id?: string; error?: string }[];
  error?: string;
}

// Map internal objectives to NewsBreak objective types
const OBJECTIVE_MAP: Record<string, string> = {
  OUTCOME_SALES: 'CONVERSIONS',
  OUTCOME_TRAFFIC: 'TRAFFIC',
  OUTCOME_ENGAGEMENT: 'ENGAGEMENT',
  OUTCOME_LEADS: 'LEAD_GENERATION',
  OUTCOME_AWARENESS: 'AWARENESS',
  OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
  // NewsBreak-native objectives pass through
  CONVERSIONS: 'CONVERSIONS',
  TRAFFIC: 'TRAFFIC',
  AWARENESS: 'AWARENESS',
  ENGAGEMENT: 'ENGAGEMENT',
  APP_INSTALLS: 'APP_INSTALLS',
  LEAD_GENERATION: 'LEAD_GENERATION',
};

export async function publishNewsBreakCampaignDraft(draftId: number, userId: number): Promise<NewsBreakPublishResult> {
  const result: NewsBreakPublishResult = { success: false, adsets: [], ads: [] };

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

  // Resolve NewsBreak auth — prefer the draft's linked account if it has credentials
  let auth = null;
  if (draft.account_id) {
    try {
      const acctResult = await pool.query(
        `SELECT platform_account_id, access_token_encrypted FROM accounts
         WHERE id = $1 AND user_id = $2 AND platform = 'newsbreak' AND status = 'active'`,
        [draft.account_id, userId]
      );
      if (acctResult.rows.length > 0 && acctResult.rows[0].access_token_encrypted) {
        auth = {
          accessToken: acctResult.rows[0].access_token_encrypted,
          accountId: acctResult.rows[0].platform_account_id || 'default',
        };
      }
    } catch { /* fall through */ }
  }
  if (!auth) auth = await getNewsBreakAuth(userId);
  if (!auth) {
    await pool.query(
      "UPDATE campaign_drafts SET status = 'failed', last_error = 'No NewsBreak credentials configured', updated_at = NOW() WHERE id = $1",
      [draftId]
    );
    result.error = 'No NewsBreak credentials configured. Please add your API key in Settings.';
    return result;
  }

  const adsetsRes = await pool.query('SELECT * FROM campaign_adsets WHERE draft_id = $1 ORDER BY id', [draftId]);
  const adsets = adsetsRes.rows;

  const nbObjective = OBJECTIVE_MAP[draft.objective] || 'TRAFFIC';

  try {
    // 1. Create NewsBreak campaign
    const nbCampaign = await createNewsBreakCampaign(
      auth.accountId,
      {
        campaign_name: draft.name,
        objective: nbObjective,
      },
      auth.accessToken
    );

    const nbCampaignId = nbCampaign.campaign_id;
    result.newsbreak_campaign_id = nbCampaignId;
    await pool.query(
      'UPDATE campaign_drafts SET newsbreak_campaign_id = $1, updated_at = NOW() WHERE id = $2',
      [nbCampaignId, draftId]
    );

    // 2. Create ad groups (ad sets)
    for (const adset of adsets) {
      try {
        const budgetMode = adset.budget_type === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL';
        const budget = adset.budget_cents / 100;

        const nbAdGroup = await createNewsBreakAdGroup(
          auth.accountId,
          {
            campaign_id: nbCampaignId,
            adgroup_name: adset.name,
            budget,
            budget_mode: budgetMode,
            schedule_start_time: adset.schedule_start || undefined,
            schedule_end_time: adset.schedule_end || undefined,
            targeting: adset.targeting || {},
          },
          auth.accessToken
        );

        const nbAdGroupId = nbAdGroup.adgroup_id;
        await pool.query(
          "UPDATE campaign_adsets SET newsbreak_adgroup_id = $1, status = 'published', updated_at = NOW() WHERE id = $2",
          [nbAdGroupId, adset.id]
        );
        result.adsets.push({ local_id: adset.id, newsbreak_id: nbAdGroupId });

        // 3. Create ads for this ad group
        const adsRes = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1 ORDER BY id', [adset.id]);
        for (const ad of adsRes.rows) {
          try {
            const cc = ad.creative_config || {};

            // Resolve image URL from media upload if provided
            let imageUrl: string | undefined;
            if (ad.media_upload_id) {
              const mediaRes = await pool.query(
                'SELECT * FROM campaign_media_uploads WHERE id = $1 AND user_id = $2',
                [ad.media_upload_id, userId]
              );
              if (mediaRes.rows.length > 0) {
                imageUrl = cc.image_url || mediaRes.rows[0].public_url;
              }
            }

            const nbAd = await createNewsBreakAd(
              auth.accountId,
              {
                adgroup_id: nbAdGroupId,
                ad_name: ad.name,
                ad_text: cc.primary_text || '',
                headline: cc.headline || '',
                image_url: imageUrl,
                landing_page_url: cc.link_url,
                call_to_action: cc.cta || 'LEARN_MORE',
              },
              auth.accessToken
            );

            await pool.query(
              "UPDATE campaign_ads SET newsbreak_ad_id = $1, status = 'published', updated_at = NOW() WHERE id = $2",
              [nbAd.ad_id, ad.id]
            );
            result.ads.push({ local_id: ad.id, newsbreak_id: nbAd.ad_id });
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

export async function activateNewsBreakCampaign(draftId: number, userId: number): Promise<void> {
  const draftRes = await pool.query(
    "SELECT * FROM campaign_drafts WHERE id = $1 AND user_id = $2 AND status = 'published'",
    [draftId, userId]
  );
  if (draftRes.rows.length === 0) throw new Error('Published draft not found');
  const draft = draftRes.rows[0];
  if (!draft.newsbreak_campaign_id) throw new Error('No NewsBreak campaign ID');

  await updateNewsBreakCampaignStatus(draft.newsbreak_campaign_id, 'ENABLE', userId);
}

export async function validateNewsBreakDraft(draftId: number, userId: number): Promise<{ valid: boolean; errors: string[] }> {
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
    if (adset.budget_cents < 500) {
      errors.push(`Ad group "${adset.name}": minimum budget is $5.00`);
    }

    const adsRes = await pool.query('SELECT * FROM campaign_ads WHERE adset_id = $1', [adset.id]);
    if (adsRes.rows.length === 0) errors.push(`Ad group "${adset.name}": at least one ad is required`);

    for (const ad of adsRes.rows) {
      if (!ad.name?.trim()) errors.push(`Ad in "${adset.name}": name is required`);
      const cc = ad.creative_config || {};
      if (!cc.primary_text?.trim() && !cc.headline?.trim()) {
        errors.push(`Ad "${ad.name}": headline or primary text is required`);
      }
      if (!cc.link_url?.trim()) errors.push(`Ad "${ad.name}": link URL is required`);
    }
  }

  // Check NewsBreak connection
  const auth = await getNewsBreakAuth(userId);
  if (!auth) {
    errors.push('No connected NewsBreak account. Please add your API key in Settings.');
  }

  return { valid: errors.length === 0, errors };
}
