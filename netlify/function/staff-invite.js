'use strict';
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requireAdmin, logAudit
} = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!requireAdmin(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { firstName, lastName, email } = body;
  if (!firstName || !lastName || !email) return badRequest('firstName, lastName, and email required');

  const siteUrl    = process.env.SITE_URL || 'https://oms.tapat.dev';
  const adminEmail = process.env.ADMIN_EMAIL;

  try {
    // Generate secure invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    // Upsert staff record
    const { error: dbErr } = await supabase
      .from('staff')
      .upsert({
        email: email.toLowerCase().trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        invite_token: inviteToken,
        invited_at: new Date().toISOString(),
        invited_by: adminEmail,
        active: true,
        accepted_at: null,
        password_hash: null,
      }, { onConflict: 'email' });

    if (dbErr) throw dbErr;

    const acceptUrl = `${siteUrl}/?staff_invite=${inviteToken}`;

    if (!process.env.SMTP_HOST) {
      console.log('[staff-invite] Staff invited (no SMTP):', email, '| Accept URL:', acceptUrl);
      await logAudit('staff_invited_no_smtp', adminEmail, email, { firstName, lastName, acceptUrl }, event);
      return ok({ sent: false, acceptUrl });
    }

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const subject = `You're invited to the Davis Center OMS Staff Portal`;

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#2E2E2E">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
      <tr><td style="background:#1F3A5F;padding:22px 32px;text-align:center">
        <div style="font-size:1rem;font-weight:700;color:#fff">Davis Center for Oral and Maxillofacial Surgery</div>
        <div style="font-size:.82rem;color:rgba(255,255,255,.7);margin-top:3px">Staff Portal Invitation</div>
      </td></tr>
      <tr><td style="padding:32px">
        <p style="margin:0 0 16px;font-size:.95rem">Dear <strong>${firstName}</strong>,</p>
        <p style="margin:0 0 16px;font-size:.95rem;line-height:1.6">You have been invited by Dr. Paul Benson to join the Davis Center for Oral and Maxillofacial Surgery staff portal.</p>
        <p style="margin:0 0 20px;font-size:.95rem;line-height:1.6">As a staff member you will be able to view patient preregistration forms, assign consent forms, and sign as a witness on consent documents.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
          <tr><td align="center">
            <a href="${acceptUrl}" style="display:inline-block;background:#3A7CA5;color:#fff;text-decoration:none;padding:13px 32px;border-radius:6px;font-weight:700;font-size:.95rem">Accept Invitation &amp; Set Password &rarr;</a>
          </td></tr>
          <tr><td align="center" style="padding-top:8px">
            <span style="font-size:.72rem;color:#6b7a8d">This link expires in 48 hours</span>
          </td></tr>
        </table>
        <p style="margin:0 0 12px;font-size:.82rem;color:#6b7a8d;line-height:1.6">If you did not expect this invitation, please disregard this email or contact our office at (801) 614-0999.</p>
      </td></tr>
      <tr><td style="background:#f4f6f8;padding:14px 32px;text-align:center;border-top:1px solid #d4dde6">
        <p style="margin:0;font-size:.72rem;color:#6b7a8d">Davis Center for Oral and Maxillofacial Surgery &middot; 890 W. Heritage Park Blvd., Suite 103 &middot; Layton, UT 84041</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    await transporter.sendMail({
      from:    `"Davis Center for OMS" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to:      `${firstName} ${lastName} <${email}>`,
      subject,
      html:    htmlBody,
      text:    `Dear ${firstName},\n\nYou have been invited to the Davis Center staff portal.\n\nAccept your invitation and set your password here:\n${acceptUrl}\n\nThis link expires in 48 hours.\n\nDavis Center for Oral and Maxillofacial Surgery\n(801) 614-0999`,
    });

    await logAudit('staff_invited', adminEmail, email, { firstName, lastName }, event);
    return ok({ sent: true });

  } catch (e) {
    console.error('[staff-invite]', e);
    return serverError('Failed to invite staff member: ' + e.message);
  }
};
