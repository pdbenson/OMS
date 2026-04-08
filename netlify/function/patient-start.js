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
    // Check patient doesn't already exist
    const { data: existing } = await supabase
      .from('patients')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) return badRequest('Patient already exists — use verify endpoint');

    // Create new patient record
    const { data: patient, error } = await supabase
      .from('patients')
      .insert({ email, status: 'draft' })
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
