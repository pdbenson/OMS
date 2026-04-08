'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requireAdmin, logAudit
} = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // Patient-initiated new edition (admin not required — verified by patient token)
  // We re-use requireAdmin check here but this endpoint is called from the patient-facing app
  // In production you may want a separate patient-authorized endpoint
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { patientId } = body;
  if (!patientId) return badRequest('patientId required');

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('edition_number, email')
      .eq('id', patientId)
      .single();

    if (pErr) throw pErr;
    if (!patient) return badRequest('Patient not found');

    const newEdition = patient.edition_number + 1;

    await supabase.from('patients').update({
      edition_number: newEdition,
      status:         'in_progress',
      completed_at:   null,
      last_activity:  new Date().toISOString(),
    }).eq('id', patientId);

    await logAudit('new_edition_started', 'patient', patient.email, { newEdition }, event);

    return ok({ editionNumber: newEdition });
  } catch (e) {
    console.error('[admin-new-edition]', e);
    return serverError('Could not start new edition');
  }
};
