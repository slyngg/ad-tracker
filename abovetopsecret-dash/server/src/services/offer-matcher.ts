/**
 * Matches incoming orders to offers based on matching rules.
 * Priority: product_id -> utm_campaign (wildcard) -> campaign_name (wildcard)
 */
import pool from '../db';

interface OrderData {
  product_id?: string;
  utm_campaign?: string;
  campaign_name?: string;
}

interface OfferRow {
  id: number;
  product_ids: string[];
  utm_campaign_match: string | null;
  campaign_name_match: string | null;
}

/** Convert a wildcard pattern (e.g. "offer-*-cold") to a RegExp */
function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${withWildcards}$`, 'i');
}

export async function matchOffer(
  userId: number,
  orderData: OrderData
): Promise<number | null> {
  try {
    const result = await pool.query(
      `SELECT id, product_ids, utm_campaign_match, campaign_name_match
       FROM offers
       WHERE user_id = $1 AND status = 'active'
       ORDER BY id`,
      [userId]
    );

    const offers: OfferRow[] = result.rows;
    if (offers.length === 0) return null;

    // Priority 1: Match by product_id
    if (orderData.product_id) {
      for (const offer of offers) {
        const pids = Array.isArray(offer.product_ids) ? offer.product_ids : [];
        if (pids.includes(orderData.product_id)) {
          return offer.id;
        }
      }
    }

    // Priority 2: Match by utm_campaign wildcard
    if (orderData.utm_campaign) {
      for (const offer of offers) {
        if (offer.utm_campaign_match) {
          const re = wildcardToRegex(offer.utm_campaign_match);
          if (re.test(orderData.utm_campaign)) {
            return offer.id;
          }
        }
      }
    }

    // Priority 3: Match by campaign_name wildcard
    if (orderData.campaign_name) {
      for (const offer of offers) {
        if (offer.campaign_name_match) {
          const re = wildcardToRegex(offer.campaign_name_match);
          if (re.test(orderData.campaign_name)) {
            return offer.id;
          }
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[Offer Matcher] Error matching offer:', err);
    return null;
  }
}
