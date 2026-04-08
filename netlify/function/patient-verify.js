'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  signPatientToken, logAudit
} = require('./_utils');

// Simple constant-time string compare to prevent timing attacks
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const email = body.email?.trim().toLowerCase();
  const dob   = body.dob?.trim(); // YYYY-MM-DD

  if (!email || !dob) return badRequest('Email and date of birth required');

  try {
    const { data: patient, error } = await supabase
      .from('patients')
      .select('id, email, dob, status, edition_number, first_name, last_name')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    if (!patient) {
      await logAudit('verify_failed_no_patient', 'patient', email, { reason: 'not_found' }, event);
      return unauthorized('No records found for this email address');
    }

    // If DOB not yet set (patient started but never saved Step 1), allow access
    if (patient.dob && !safeEqual(patient.dob, dob)) {
      await logAudit('verify_failed_dob', 'patient', email, { reason: 'dob_mismatch' }, event);
      // Generic message — don't reveal which field was wrong
      return unauthorized('Date of birth does not match our records');
    }

    await logAudit('patient_verified', 'patient', email, null, event);

    return ok({
      token:         signPatientToken(patient.id, email),
      patientId:     patient.id,
      status:        patient.status,
      editionNumber: patient.edition_number,
      name:          `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
    });
  } catch (e) {
    console.error('[patient-verify]', e);
    return serverError('Verification failed');
  }
};
