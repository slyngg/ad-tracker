import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = process.env.SMTP_FROM || 'OpticData Alerts <alerts@opticdata.io>';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!process.env.SMTP_USER) {
    console.warn('[Email] SMTP not configured — skipping email delivery');
    return false;
  }

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return true;
  } catch (err) {
    console.error('[Email] Failed to send:', err);
    return false;
  }
}

export function buildRuleAlertEmail(
  ruleName: string,
  metrics: Record<string, number>,
  actionType: string
): { subject: string; html: string } {
  const subject = `Rule Triggered: ${ruleName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #111827; color: #f9fafb; border-radius: 12px; overflow: hidden;">
      <div style="background: #3b82f6; padding: 16px 20px;">
        <h2 style="margin: 0; font-size: 16px; color: white;">Rule Triggered: ${ruleName}</h2>
      </div>
      <div style="padding: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Spend</td>
            <td style="padding: 8px 0; text-align: right; font-family: monospace; color: #f9fafb;">$${(metrics.spend || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Revenue</td>
            <td style="padding: 8px 0; text-align: right; font-family: monospace; color: #22c55e;">$${(metrics.revenue || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">ROAS</td>
            <td style="padding: 8px 0; text-align: right; font-family: monospace; color: #f9fafb;">${(metrics.roas || 0).toFixed(2)}x</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">CPA</td>
            <td style="padding: 8px 0; text-align: right; font-family: monospace; color: #f9fafb;">$${(metrics.cpa || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Conversions</td>
            <td style="padding: 8px 0; text-align: right; font-family: monospace; color: #f9fafb;">${metrics.conversions || 0}</td>
          </tr>
        </table>
        <div style="margin-top: 16px; padding: 12px; background: #1f2937; border-radius: 8px;">
          <span style="color: #9ca3af; font-size: 12px;">Action taken: </span>
          <span style="color: #3b82f6; font-size: 12px; font-weight: 600;">${actionType}</span>
        </div>
        <div style="margin-top: 16px; text-align: center;">
          <a href="${process.env.APP_URL || 'https://app.opticdata.io'}/rules" style="display: inline-block; padding: 10px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">View Rules</a>
        </div>
      </div>
      <div style="padding: 12px 20px; background: #0d1117; text-align: center;">
        <span style="color: #6b7280; font-size: 11px;">Sent by OpticData at ${new Date().toISOString()}</span>
      </div>
    </div>
  `;
  return { subject, html };
}
