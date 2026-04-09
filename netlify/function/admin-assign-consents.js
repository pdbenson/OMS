'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requireAdmin, requireStaff, logAudit
} = require('./_utils');

const VALID_CONSENTS = ['surgical','anesthesia','photo','postop','iv_sed'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const caller = requireStaff(event);
  if (!caller) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { patientId, consentTypes } = body;
  if (!patientId || !Array.isArray(consentTypes)) return badRequest('patientId and consentTypes[] required');

  const filtered = consentTypes.filter(c => VALID_CONSENTS.includes(c));
  const adminEmail = process.env.ADMIN_EMAIL;

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('email')
      .eq('id', patientId)
      .single();

    if (pErr) throw pErr;
    if (!patient) return badRequest('Patient not found');

    const { error: uErr } = await supabase
      .from('patients')
      .update({ assigned_consents: filtered, last_activity: new Date().toISOString() })
      .eq('id', patientId);

    if (uErr) throw uErr;

    await logAudit('consents_assigned', adminEmail, patient.email, { consentTypes: filtered }, event);

    return ok({ assigned: filtered });
  } catch (e) {
    console.error('[admin-assign-consents]', e);
    return serverError('Could not assign consent forms');
  }
};
