import pool from '../db';

/**
 * Get the user's configured timezone (defaults to 'UTC').
 */
export async function getUserTimezone(userId: number | null | undefined): Promise<string> {
  if (!userId) return 'UTC';
  try {
    const result = await pool.query(
      'SELECT timezone FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.timezone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Returns SQL expressions for "today start" and "yesterday start" in the user's timezone,
 * converted back to UTC for use in WHERE clauses against UTC timestamps.
 *
 * Example: For a user in 'America/New_York' at 2pm ET on Feb 20:
 *   todayStart  = '2026-02-20 05:00:00 UTC'  (midnight ET in UTC)
 *   yesterdayStart = '2026-02-19 05:00:00 UTC'
 *
 * These are computed in SQL to avoid JS/DB timezone drift.
 */
export function tzBoundarySQL(tzParam: string): {
  todayStart: string;
  yesterdayStart: string;
  yesterdayEnd: string;
} {
  // "today start" = midnight in user's TZ, converted to UTC
  // date_trunc('day', NOW() AT TIME ZONE tz) gives midnight in user's TZ as a "timestamp without timezone"
  // Then we interpret it as being in the user's TZ and convert to UTC
  return {
    todayStart: `(date_trunc('day', NOW() AT TIME ZONE '${tzParam}') AT TIME ZONE '${tzParam}')`,
    yesterdayStart: `(date_trunc('day', NOW() AT TIME ZONE '${tzParam}') AT TIME ZONE '${tzParam}' - INTERVAL '1 day')`,
    yesterdayEnd: `(date_trunc('day', NOW() AT TIME ZONE '${tzParam}') AT TIME ZONE '${tzParam}')`,
  };
}

/**
 * Returns the archived_date for "yesterday" in the user's timezone.
 * This may differ from CURRENT_DATE - 1 if the user is far from UTC.
 */
export function tzArchivedDateSQL(tzParam: string): string {
  return `(date_trunc('day', NOW() AT TIME ZONE '${tzParam}'))::DATE - INTERVAL '1 day'`;
}

/**
 * Get all distinct timezones configured by users.
 */
export async function getDistinctTimezones(): Promise<string[]> {
  try {
    const result = await pool.query(
      "SELECT DISTINCT COALESCE(timezone, 'UTC') AS tz FROM users"
    );
    return result.rows.map(r => r.tz);
  } catch {
    return ['UTC'];
  }
}

/**
 * Check if midnight has just passed (within the last hour) for a given timezone.
 */
export function isMidnightHour(tz: string): boolean {
  try {
    // Get current time in the given timezone
    const now = new Date();
    const tzTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = tzTime.getHours();
    // Midnight hour = 0:00-0:59
    return hour === 0;
  } catch {
    return false;
  }
}

/**
 * Get user IDs whose timezone just hit midnight (current hour is 0 in their TZ).
 */
export async function getUsersAtMidnight(): Promise<number[]> {
  try {
    // Use PostgreSQL to find users whose timezone is currently at midnight hour
    const result = await pool.query(`
      SELECT DISTINCT id FROM users
      WHERE EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(timezone, 'UTC')) = 0
    `);
    return result.rows.map(r => r.id);
  } catch {
    return [];
  }
}
