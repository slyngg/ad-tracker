/**
 * Shared utility for parsing account_id, offer_id, brand_id, and client_id
 * filters from query params.
 * Used by all data routes to inject optional WHERE clause fragments.
 *
 * Usage:
 *   const af = await parseAccountFilter(req.query, userParams.length + 1, userId);
 *   const allParams = [...userParams, ...af.params];
 *   // SQL: WHERE user_id = $1 ${af.clause}
 */

import pool from '../db';

export interface AccountFilterResult {
  clause: string;          // e.g. "AND account_id = ANY($2::int[])" or ""
  params: any[];           // e.g. [[1,2,3]] or []
  nextParamIndex: number;  // for callers to append more params
}

/**
 * Parse comma-separated IDs from a query param string.
 */
function parseIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

export async function parseAccountFilter(
  query: Record<string, any>,
  startParamIndex: number,
  userId?: number | null
): Promise<AccountFilterResult> {
  let clause = '';
  const params: any[] = [];
  let idx = startParamIndex;

  // Resolve brand_id / client_id → account IDs
  let resolvedAccountIds: number[] | null = null;

  const brandIds = parseIds(query.brand_id);
  const clientIds = parseIds(query.client_id);

  if (brandIds.length > 0) {
    // brand_id → accounts where brand_config_id matches
    const result = await pool.query(
      'SELECT id FROM accounts WHERE brand_config_id = ANY($1::int[])' +
        (userId ? ' AND user_id = $2' : ''),
      userId ? [brandIds, userId] : [brandIds]
    );
    resolvedAccountIds = result.rows.map((r: any) => r.id);
  } else if (clientIds.length > 0) {
    // client_id → brand_config IDs → account IDs
    const result = await pool.query(
      `SELECT a.id FROM accounts a
       JOIN brand_configs bc ON bc.id = a.brand_config_id
       WHERE bc.client_id = ANY($1::int[])` +
        (userId ? ' AND a.user_id = $2' : ''),
      userId ? [clientIds, userId] : [clientIds]
    );
    resolvedAccountIds = result.rows.map((r: any) => r.id);
  }

  // account_id — supports comma-separated: ?account_id=1,2,3
  const explicitAccountIds = parseIds(query.account_id);

  // Combine: if both resolved and explicit, intersect; otherwise use whichever exists
  let finalAccountIds: number[] | null = null;
  if (resolvedAccountIds !== null && explicitAccountIds.length > 0) {
    const resolvedSet = new Set(resolvedAccountIds);
    finalAccountIds = explicitAccountIds.filter((id) => resolvedSet.has(id));
  } else if (resolvedAccountIds !== null) {
    finalAccountIds = resolvedAccountIds;
  } else if (explicitAccountIds.length > 0) {
    finalAccountIds = explicitAccountIds;
  }

  if (finalAccountIds !== null) {
    if (finalAccountIds.length === 0) {
      // Brand/client has no accounts — return impossible condition so no data leaks
      clause += ' AND 1=0';
    } else {
      clause += ` AND account_id = ANY($${idx}::int[])`;
      params.push(finalAccountIds);
      idx++;
    }
  }

  // offer_id — supports comma-separated: ?offer_id=5,6
  const offerIds = parseIds(query.offer_id);
  if (offerIds.length > 0) {
    clause += ` AND offer_id = ANY($${idx}::int[])`;
    params.push(offerIds);
    idx++;
  }

  return { clause, params, nextParamIndex: idx };
}
