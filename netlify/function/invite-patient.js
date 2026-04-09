'use strict';
const nodemailer = require('nodemailer');
const { supabase, ok, badRequest, unauthorized, serverError, handleOptions, requireAdmin, logAudit } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  if (!requireAdmin(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { firstName, lastName, email, phone } = body;
  if (!firstName || !lastName || !email) return badRequest('firstName, lastName, and email are required');

  const siteUrl   = process.env.SITE_URL || 'https://oms.tapat.dev';
  const adminEmail = process.env.ADMIN_EMAIL;

  try {
    // Create a draft patient record so they appear in the dashboard
    const { error: dbErr } = await supabase
      .from('patients')
      .upsert({
        email: email.toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        status: 'invited',
        last_activity: new Date().toISOString(),
      }, { onConflict: 'email', ignoreDuplicates: false });

    if (dbErr) console.error('[invite-patient] DB upsert warning:', dbErr.message);

    if (!process.env.SMTP_HOST) {
      console.log('[invite-patient] *** NEW PATIENT INVITE ***');
      console.log('[invite-patient] To:', email, '| Name:', firstName, lastName);
      console.log('[invite-patient] SMTP not configured — set SMTP env vars to send email');
      await logAudit('patient_invited_no_smtp', adminEmail, email, { firstName, lastName, phone }, event);
      return ok({ sent: false, queued: true, message: 'Patient record created. Email not sent — SMTP not configured.' });
    }

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const subject = `Welcome to Davis Center for Oral and Maxillofacial Surgery — Complete Your Preregistration`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Helvetica Neue',Arial,sans-serif;color:#2E2E2E">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

      <!-- HEADER -->
      <tr><td style="background:#1F3A5F;padding:24px 32px;text-align:center">
        <div style="font-size:1.1rem;font-weight:700;color:#ffffff;letter-spacing:.02em">Davis Center for Oral and Maxillofacial Surgery</div>
        <div style="font-size:.85rem;color:rgba(255,255,255,.7);margin-top:4px;font-style:italic">Paul Benson, DMD, MD</div>
      </td></tr>

      <!-- BODY -->
      <tr><td style="padding:32px 32px 24px">
        <p style="margin:0 0 16px;font-size:.95rem">Dear <strong>${firstName}</strong>,</p>
        <p style="margin:0 0 16px;font-size:.95rem;line-height:1.6">Welcome to Davis Center for Oral and Maxillofacial Surgery. We're looking forward to providing you with exceptional care.</p>
        <p style="margin:0 0 20px;font-size:.95rem;line-height:1.6">To prepare for your upcoming visit, we invite you to complete your patient preregistration online at your convenience. It takes about 10&ndash;15 minutes and can be done from any device.</p>

        <!-- CTA BUTTON -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
          <tr><td align="center">
            <a href="${siteUrl}?action=preregister" style="display:inline-block;background:#3A7CA5;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:6px;font-weight:700;font-size:.95rem;letter-spacing:.02em">Begin My Preregistration &rarr;</a>
          </td></tr>
          <tr><td align="center" style="padding-top:8px">
            <span style="font-size:.75rem;color:#6b7a8d">${siteUrl}?action=preregister</span>
          </td></tr>
        </table>

        <!-- WHAT TO EXPECT -->
        <div style="background:#f4f6f8;border-radius:8px;padding:16px 20px;margin:0 0 20px">
          <div style="font-size:.82rem;font-weight:700;color:#1F3A5F;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">During preregistration you will complete:</div>
          <table cellpadding="0" cellspacing="0">
            <tr><td style="padding:3px 0;font-size:.88rem;color:#2E2E2E">&#x2713;&nbsp; Patient information &amp; contact details</td></tr>
            <tr><td style="padding:3px 0;font-size:.88rem;color:#2E2E2E">&#x2713;&nbsp; Insurance information</td></tr>
            <tr><td style="padding:3px 0;font-size:.88rem;color:#2E2E2E">&#x2713;&nbsp; Health history</td></tr>
            <tr><td style="padding:3px 0;font-size:.88rem;color:#2E2E2E">&#x2713;&nbsp; HIPAA Privacy Notice acknowledgment</td></tr>
          </table>
        </div>

        <p style="margin:0 0 12px;font-size:.88rem;color:#6b7a8d;line-height:1.6">Completing this before your appointment helps us serve you more efficiently and keeps your visit running on time.</p>
        <p style="margin:0 0 24px;font-size:.88rem;color:#6b7a8d;line-height:1.6">If you have any questions or need assistance, please call us at <strong style="color:#2E2E2E">(801) 614-0999</strong>.</p>

        <p style="margin:0 0 4px;font-size:.92rem">We look forward to seeing you soon.</p>
        <p style="margin:0;font-size:.92rem">Warm regards,</p>
      </td></tr>

      <!-- SIGNATURE -->
      <tr><td style="padding:0 32px 32px">
        <div style="border-top:1px solid #d4dde6;padding-top:16px">
          <strong style="font-size:.95rem;color:#1F3A5F">Davis Center for Oral and Maxillofacial Surgery</strong><br>
          <span style="font-size:.85rem;color:#6b7a8d">Paul Benson, DMD, MD</span><br>
          <span style="font-size:.82rem;color:#6b7a8d">890 W. Heritage Park Blvd., Suite 103 &middot; Layton, Utah 84041</span><br>
          <span style="font-size:.82rem;color:#6b7a8d">(801) 614-0999 &middot; info.davisoms@gmail.com</span>
        </div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#f4f6f8;padding:16px 32px;text-align:center;border-top:1px solid #d4dde6">
        <p style="margin:0;font-size:.72rem;color:#6b7a8d;line-height:1.6">This invitation was sent by Davis Center for Oral and Maxillofacial Surgery.<br>Please do not reply to this email. Call (801) 614-0999 for assistance.</p>
        <p style="margin:8px 0 0;font-size:.72rem;color:#aaa">&copy; 2026 Davis Center for Oral and Maxillofacial Surgery &middot; All Rights Reserved</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

    const textBody = `Dear ${firstName},\n\nWelcome to Davis Center for Oral and Maxillofacial Surgery. We're looking forward to providing you with exceptional care.\n\nTo prepare for your upcoming visit, please complete your patient preregistration at: ${siteUrl}?action=preregister\n\nDuring preregistration you will complete:\n- Patient information & contact details\n- Insurance information\n- Health history\n- HIPAA Privacy Notice acknowledgment\n\nIf you have any questions, please call us at (801) 614-0999.\n\nWarm regards,\nDavis Center for Oral and Maxillofacial Surgery\nPaul Benson, DMD, MD\n890 W. Heritage Park Blvd., Suite 103 · Layton, Utah 84041\n(801) 614-0999 · info.davisoms@gmail.com`;

    await transporter.sendMail({
      from: `"Davis Center for OMS" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to:   `${firstName} ${lastName} <${email}>`,
      subject,
      html: htmlBody,
      text: textBody,
    });

    await logAudit('patient_invited', adminEmail, email, { firstName, lastName, phone }, event);
    return ok({ sent: true });

  } catch (e) {
    console.error('[invite-patient]', e);
    return serverError('Failed to send invitation: ' + e.message);
  }
};
