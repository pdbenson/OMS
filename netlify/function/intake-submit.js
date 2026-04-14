'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requirePatient, logAudit
} = require('./_utils');
const nodemailer = require('nodemailer');

const VALID_KEYS = ['pi', 'ins', 'hh', 'hipaa'];

async function sendAdminNotification(patientName, patientEmail, adminUrl) {
  // Configure with HIPAA-compliant SMTP (e.g. Paubox)
  // NO PHI in the email body — only a notification + link
  if (!process.env.SMTP_HOST) {
    console.log('[notify] SMTP not configured — skipping email notification');
    return;
  }
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from:    process.env.SMTP_FROM || process.env.SMTP_USER,
    to:      process.env.ADMIN_EMAIL,
    subject: 'New Patient Intake Submitted — Action Required',
    text:    [
      'A patient has completed their pre-registration intake forms.',
      '',
      'Please log in to the patient portal to review:',
      adminUrl,
      '',
      'Do not reply to this email.',
      '— Davis Center OMS Intake System',
    ].join('\n'),
    // No patient name, DOB, or PHI in email body
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const decoded = requirePatient(event);
  if (!decoded) return unauthorized();
  const { sub: patientId, email } = decoded;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { formKey, data, ynMap, signatures, isFinal } = body;
  if (!VALID_KEYS.includes(formKey)) return badRequest('Invalid form key');

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('edition_number, first_name, last_name')
      .eq('id', patientId)
      .single();
    if (pErr) throw pErr;

    const edition = patient.edition_number;
    const now = new Date().toISOString();

    // Upsert form data as done
    const { error: uErr } = await supabase
      .from('form_data')
      .upsert({
        patient_id:   patientId,
        form_key:     formKey,
        edition,
        data:         data  || {},
        yn_map:       ynMap || {},
        done:         true,
        completed_at: now,
      }, { onConflict: 'patient_id,form_key,edition' });
    if (uErr) throw uErr;

    // Save signatures
    if (signatures && typeof signatures === 'object') {
      for (const [sigKey, dataUrl] of Object.entries(signatures)) {
        if (!dataUrl || typeof dataUrl !== 'string') continue;
        await supabase.from('signatures').upsert({
          patient_id: patientId,
          sig_key:    sigKey,
          edition,
          data_url:   dataUrl,
        }, { onConflict: 'patient_id,sig_key,edition' });
      }
    }

    // Update patient record
    const updates = { last_activity: now };
    if (formKey === 'pi' && data?.dob)  updates.dob = data.dob;
    if (formKey === 'pi' && data?.name) {
      const parts = (data.name || '').trim().split(/\s+/);
      updates.first_name = parts[0] || '';
      updates.last_name  = parts.length > 1 ? parts[parts.length - 1] : '';
    }

    if (isFinal) {
      updates.status       = 'completed';
      updates.completed_at = now;
    } else {
      updates.status = 'in_progress';
    }

    await supabase.from('patients').update(updates).eq('id', patientId);

    await logAudit(
      isFinal ? 'intake_completed' : `form_${formKey}_submitted`,
      'patient', email, { formKey, edition }, event
    );

    // Send admin notification on final submission (NO PHI in email)
    if (isFinal) {
      const adminUrl = `${process.env.SITE_URL || 'https://oms.tapat.dev'}/`;
      if (!process.env.SMTP_HOST) {
        console.log('[notify] *** NEW PATIENT INTAKE SUBMITTED ***');
        console.log('[notify] Patient email:', email);
        console.log('[notify] Submitted at:', now);
        console.log('[notify] SMTP not configured — set SMTP_HOST in Netlify env vars to enable email notifications');
      } else {
        await sendAdminNotification(
          `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
          email,
          adminUrl
        ).catch(e => console.error('[notify]', e.message));
      }
    }

    return ok({ submitted: true, final: !!isFinal });
  } catch (e) {
    console.error('[intake-submit]', e);
    return serverError('Could not submit form');
  }
};
