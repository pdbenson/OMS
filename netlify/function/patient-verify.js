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

  const selectedId = body.patientId || null; // second call after a "which patient?" pick

  try {
    // An email may belong to multiple patients (family members sharing an address)
    const { data: rows, error } = await supabase
      .from('patients')
      .select('id, email, dob, status, edition_number, first_name, last_name')
      .eq('email', email)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!rows || !rows.length) {
      await logAudit('verify_failed_no_patient', 'patient', email, { reason: 'not_found' }, event);
      return unauthorized('No records found for this email address');
    }

    // Candidates: DOB matches, or DOB not yet set (invited, never saved Step 1)
    const dobMatches = rows.filter(r => r.dob && safeEqual(r.dob, dob));
    const noDob      = rows.filter(r => !r.dob);
    const candidates = dobMatches.length ? dobMatches : noDob;

    if (!candidates.length) {
      await logAudit('verify_failed_dob', 'patient', email, { reason: 'dob_mismatch' }, event);
      // Generic message — don't reveal which field was wrong
      return unauthorized('Date of birth does not match our records');
    }

    let patient;
    if (selectedId) {
      // Selection must come from the legitimate candidate set for this email+DOB
      patient = candidates.find(r => r.id === selectedId);
      if (!patient) {
        await logAudit('verify_failed_selection', 'patient', email, { reason: 'invalid_selection' }, event);
        return unauthorized('Selection did not match our records');
      }
    } else if (candidates.length === 1) {
      patient = candidates[0];
    } else {
      // Rare: twins sharing a DOB, or multiple invited records awaiting first login
      await logAudit('verify_needs_selection', 'patient', email, { count: candidates.length }, event);
      return ok({
        needsSelection: true,
        options: candidates.map(r => ({
          patientId: r.id,
          firstName: r.first_name || 'Patient',
          lastInitial: (r.last_name || '').charAt(0).toUpperCase(),
        })),
      });
    }

    await logAudit('patient_verified', 'patient', email, { patientId: patient.id }, event);

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
