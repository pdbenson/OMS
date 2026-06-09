'use strict';
const nodemailer = require('nodemailer');
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requireStaff, logAudit
} = require('./_utils');
const { buildReminderEmail } = require('./_reminder-email');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  if (!requireStaff(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { patientId, email, firstName, apptDate, apptTime, dayStr, timeStr } = body;

  if (!patientId || !apptDate) {
    return badRequest('Missing patientId or appointmentDate');
  }
  if (!email || !apptTime || !dayStr || !timeStr) {
    return badRequest('email, apptTime, dayStr, and timeStr are required');
  }

  if (!process.env.SMTP_HOST) {
    console.log('[send-reminder] SMTP not configured');
    return serverError('Email service not configured. Please set SMTP environment variables.');
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const siteUrl   = process.env.SITE_URL || 'https://oms.tapat.dev';
  const name      = firstName || 'Patient';

  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const { subject, html, text } = buildReminderEmail({ firstName: name, dayStr, timeStr, siteUrl });

    await transporter.sendMail({
      from:    `"Davis Center for OMS" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to:      email,
      subject,
      html,
      text,
    });

    // Store appointment date on patient record for future reference
    if (patientId) {
      await supabase
        .from('patients')
        .update({
          appointment_date: apptDate,
          appointment_time: apptTime || null,
          last_reminder_sent_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        })
        .eq('id', patientId);
    }

    await logAudit('reminder_sent', adminEmail, email, { apptDate, apptTime, dayStr, timeStr }, event);

    return ok({ sent: true });

  } catch (e) {
    console.error('[send-reminder]', e);
    return serverError('Failed to send reminder email: ' + e.message);
  }
};
