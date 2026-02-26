/**
 * DNS Pixel Service
 *
 * Manages custom domain configuration for first-party pixel tracking.
 * When a user sets up a custom domain (e.g. "i.mystore.com"), the pixel
 * script serves from and posts events to that domain — making all tracking
 * truly first-party and bypassing ITP, ad blockers, and browser privacy restrictions.
 *
 * Flow:
 *   1. User calls generateDnsChallenge() → gets A + TXT records to create
 *   2. User creates DNS records at their registrar
 *   3. User calls verifyDns() → we check A + TXT records
 *   4. If verified, pixel.js starts using the custom domain for event POSTs
 */

import crypto from 'crypto';
import dns from 'dns';
import pool from '../db';

const dnsResolver = dns.promises;

// ── Types ────────────────────────────────────────────────────

export interface DnsChallenge {
  customDomain: string;
  aRecord: { host: string; value: string; type: 'A' };
  txtRecord: { host: string; value: string; type: 'TXT' };
}

export interface DnsVerificationResult {
  verified: boolean;
  aRecord: boolean;
  txtRecord: boolean;
  errors: string[];
}

export interface DnsStatus {
  customDomain: string | null;
  dnsVerified: boolean;
  dnsVerifiedAt: string | null;
  hasChallengeToken: boolean;
}

// ── Generate DNS Challenge ───────────────────────────────────

/**
 * Creates a random verification token, stores it on the pixel_site record,
 * and returns the DNS records the user needs to create.
 */
export async function generateDnsChallenge(
  siteId: number,
  userId: number,
  customDomain: string,
): Promise<DnsChallenge> {
  // Sanitize custom domain — strip protocol, trailing slashes, whitespace
  const domain = customDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase();

  if (!domain || !/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/.test(domain)) {
    throw new Error('Invalid domain format');
  }

  // Generate a random challenge token
  const challengeToken = crypto.randomBytes(32).toString('hex');

  // Store on the pixel_site record
  const result = await pool.query(
    `UPDATE pixel_sites
     SET custom_domain = $3,
         dns_challenge_token = $4,
         dns_verified = false,
         dns_verified_at = NULL,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [siteId, userId, domain, challengeToken],
  );

  if (result.rows.length === 0) {
    throw new Error('Site not found');
  }

  // Determine the server IP the A record should point to
  const serverIp = process.env.PIXEL_SERVER_IP || '0.0.0.0';

  // Build the TXT record host: _opticdata.<root-domain>
  // e.g. for "i.mystore.com" → "_opticdata.mystore.com"
  const domainParts = domain.split('.');
  const rootDomain = domainParts.length > 2
    ? domainParts.slice(1).join('.')
    : domain;
  const txtHost = `_opticdata.${rootDomain}`;

  return {
    customDomain: domain,
    aRecord: {
      host: domain,
      value: serverIp,
      type: 'A',
    },
    txtRecord: {
      host: txtHost,
      value: `odt-verify=${challengeToken}`,
      type: 'TXT',
    },
  };
}

// ── Verify DNS Records ───────────────────────────────────────

/**
 * Performs DNS lookups on the custom_domain to verify A and TXT records.
 * If both pass, marks the site as dns_verified.
 */
export async function verifyDns(
  siteId: number,
  userId: number,
): Promise<DnsVerificationResult> {
  // Fetch the site's DNS config
  const siteResult = await pool.query(
    `SELECT custom_domain, dns_challenge_token
     FROM pixel_sites
     WHERE id = $1 AND user_id = $2`,
    [siteId, userId],
  );

  if (siteResult.rows.length === 0) {
    throw new Error('Site not found');
  }

  const { custom_domain, dns_challenge_token } = siteResult.rows[0];

  if (!custom_domain) {
    throw new Error('No custom domain configured');
  }

  if (!dns_challenge_token) {
    throw new Error('No challenge token — run DNS setup first');
  }

  const errors: string[] = [];
  let aRecordOk = false;
  let txtRecordOk = false;

  const expectedIp = process.env.PIXEL_SERVER_IP || '0.0.0.0';

  // 1. Check A record
  try {
    const addresses = await dnsResolver.resolve4(custom_domain);
    if (addresses.includes(expectedIp)) {
      aRecordOk = true;
    } else {
      errors.push(
        `A record for ${custom_domain} resolves to ${addresses.join(', ')} — expected ${expectedIp}`,
      );
    }
  } catch (err: any) {
    errors.push(`A record lookup failed for ${custom_domain}: ${err.code || err.message}`);
  }

  // 2. Check TXT record
  const domainParts = custom_domain.split('.');
  const rootDomain = domainParts.length > 2
    ? domainParts.slice(1).join('.')
    : custom_domain;
  const txtHost = `_opticdata.${rootDomain}`;
  const expectedValue = `odt-verify=${dns_challenge_token}`;

  try {
    const txtRecords = await dnsResolver.resolveTxt(txtHost);
    // TXT records come back as arrays of chunks — join each record
    const flatValues = txtRecords.map((chunks) => chunks.join(''));
    if (flatValues.some((v) => v === expectedValue)) {
      txtRecordOk = true;
    } else {
      errors.push(
        `TXT record at ${txtHost} does not contain "${expectedValue}" — found: ${flatValues.join(', ') || '(empty)'}`,
      );
    }
  } catch (err: any) {
    errors.push(`TXT record lookup failed for ${txtHost}: ${err.code || err.message}`);
  }

  // 3. If both pass, update the site as verified
  const verified = aRecordOk && txtRecordOk;

  if (verified) {
    await pool.query(
      `UPDATE pixel_sites
       SET dns_verified = true,
           dns_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [siteId, userId],
    );
  }

  return {
    verified,
    aRecord: aRecordOk,
    txtRecord: txtRecordOk,
    errors,
  };
}

// ── Get DNS Status ───────────────────────────────────────────

/**
 * Returns current DNS configuration and verification status for a site.
 */
export async function getDnsStatus(
  siteId: number,
  userId: number,
): Promise<DnsStatus> {
  const result = await pool.query(
    `SELECT custom_domain, dns_verified, dns_verified_at, dns_challenge_token
     FROM pixel_sites
     WHERE id = $1 AND user_id = $2`,
    [siteId, userId],
  );

  if (result.rows.length === 0) {
    throw new Error('Site not found');
  }

  const row = result.rows[0];

  return {
    customDomain: row.custom_domain || null,
    dnsVerified: row.dns_verified,
    dnsVerifiedAt: row.dns_verified_at || null,
    hasChallengeToken: !!row.dns_challenge_token,
  };
}

// ── Lookup site by custom domain ─────────────────────────────

/**
 * Resolves a pixel site by its verified custom domain hostname.
 * Used by the tracking routes to match incoming requests on custom domains.
 */
export async function resolveSiteByCustomDomain(
  hostname: string,
): Promise<{ userId: number; siteId: number; siteToken: string } | null> {
  const domain = hostname.toLowerCase().replace(/:\d+$/, ''); // strip port
  const result = await pool.query(
    `SELECT id, user_id, site_token
     FROM pixel_sites
     WHERE custom_domain = $1 AND dns_verified = true AND enabled = true`,
    [domain],
  );

  if (result.rows.length === 0) return null;
  return {
    userId: result.rows[0].user_id,
    siteId: result.rows[0].id,
    siteToken: result.rows[0].site_token,
  };
}
