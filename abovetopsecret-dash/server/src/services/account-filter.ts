/**
 * Shared utility for parsing account_id and offer_id filters from query params.
 * Used by all data routes to inject optional WHERE clause fragments.
 *
 * Usage:
 *   const af = parseAccountFilter(req.query, userParams.length + 1);
 *   const allParams = [...userParams, ...af.params];
 *   // SQL: WHERE user_id = $1 ${af.clause}
 */

export interface AccountFilterResult {
  clause: string;          // e.g. "AND account_id = ANY($2::int[])" or ""
  params: any[];           // e.g. [[1,2,3]] or []
  nextParamIndex: number;  // for callers to append more params
}

export function parseAccountFilter(
  query: Record<string, any>,
  startParamIndex: number
): AccountFilterResult {
  let clause = '';
  const params: any[] = [];
  let idx = startParamIndex;

  // account_id — supports comma-separated: ?account_id=1,2,3
  const rawAccountId = query.account_id;
  if (rawAccountId) {
    const ids = String(rawAccountId)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (ids.length > 0) {
      clause += ` AND account_id = ANY($${idx}::int[])`;
      params.push(ids);
      idx++;
    }
  }

  // offer_id — supports comma-separated: ?offer_id=5,6
  const rawOfferId = query.offer_id;
  if (rawOfferId) {
    const ids = String(rawOfferId)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (ids.length > 0) {
      clause += ` AND offer_id = ANY($${idx}::int[])`;
      params.push(ids);
      idx++;
    }
  }

  return { clause, params, nextParamIndex: idx };
}
