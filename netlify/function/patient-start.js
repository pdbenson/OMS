'use strict';
const { supabase, created, badRequest, serverError, handleOptions, signPatientToken, logAudit } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return badRequest('Valid email required');
  }

  try {
    // Multiple patients may share an email (family members) — creating a new
    // record alongside existing ones is allowed. The frontend routes returning
    // patients through patient-verify; this path is reached for brand-new emails
    // or via the explicit "register a new patient with this email" option.

    // Create new patient record
    const { data: patient, error } = await supabase
      .from('patients')
      .insert({ email, status: 'draft', terms_accepted_at: body.termsAcceptedAt || new Date().toISOString() })
      .select('id')
      .single();

    if (error) throw error;

    await logAudit('patient_created', 'patient', email, null, event);

    return created({
      token:     signPatientToken(patient.id, email),
      patientId: patient.id,
    });
  } catch (e) {
    console.error('[patient-start]', e);
    return serverError('Could not create patient record');
  }
};
