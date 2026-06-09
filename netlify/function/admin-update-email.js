'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requireStaff, logAudit
} = require('./_utils');

// POST { patientId, email }
// All admin tiers (admin, provider, staff) may correct a patient's email.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const actor = requireStaff(event);
  if (!actor) return unauthorized();
  const actorEmail = actor.email || process.env.ADMIN_EMAIL;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const patientId = body.patientId;
  const newEmail  = (body.email || '').trim().toLowerCase();

  if (!patientId) return badRequest('patientId required');
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return badRequest('A valid email address is required');
  }

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('id, email, first_name, last_name')
      .eq('id', patientId)
      .single();
    if (pErr) throw pErr;
    if (!patient) return badRequest('Patient not found');

    const oldEmail = patient.email;
    if (oldEmail === newEmail) return ok({ patientId, email: newEmail, unchanged: true });

    // Shared family emails are supported — no uniqueness check needed.
    const { error: uErr } = await supabase
      .from('patients')
      .update({
        email: newEmail,
        last_activity: new Date().toISOString(),
        // NOTE (item 1, future): when email_status bounce-flagging lands,
        // clear it here — a corrected address starts with a clean slate.
      })
      .eq('id', patientId);
    if (uErr) throw uErr;

    await logAudit('patient_email_changed', actorEmail, newEmail, {
      patientId, oldEmail, newEmail,
    }, event);

    return ok({ patientId, email: newEmail });
  } catch (e) {
    console.error('[admin-update-email]', e);
    return serverError('Could not update email');
  }
};
