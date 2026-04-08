'use strict';
const {
  supabase, ok, unauthorized, serverError, handleOptions,
  requirePatient, logAudit
} = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const decoded = requirePatient(event);
  if (!decoded) return unauthorized();

  const { sub: patientId, email } = decoded;

  try {
    // Patient record
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('id, email, first_name, last_name, status, edition_number, last_activity, completed_at, assigned_consents')
      .eq('id', patientId)
      .single();

    if (pErr) throw pErr;

    // All form data for current edition
    const { data: forms, error: fErr } = await supabase
      .from('form_data')
      .select('form_key, data, yn_map, done, completed_at')
      .eq('patient_id', patientId)
      .eq('edition', patient.edition_number);

    if (fErr) throw fErr;

    // Signatures for current edition (data_url omitted for list view — fetched on demand)
    const { data: sigs, error: sErr } = await supabase
      .from('signatures')
      .select('sig_key, data_url')
      .eq('patient_id', patientId)
      .eq('edition', patient.edition_number);

    if (sErr) throw sErr;

    // Organise forms by key
    const formMap = {};
    for (const f of (forms || [])) {
      formMap[f.form_key] = { done: f.done, data: f.data || {}, ynMap: f.yn_map || {}, completedAt: f.completed_at };
    }
    const sigMap = {};
    for (const s of (sigs || [])) sigMap[s.sig_key] = s.data_url;

    await logAudit('patient_data_accessed', 'patient', email, null, event);

    return ok({
      patient: {
        id:              patient.id,
        email:           patient.email,
        name:            `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
        status:          patient.status,
        editionNumber:   patient.edition_number,
        lastActivity:    patient.last_activity,
        completedAt:     patient.completed_at,
        assignedConsents: patient.assigned_consents || [],
      },
      forms:      formMap,
      signatures: sigMap,
    });
  } catch (e) {
    console.error('[patient-data]', e);
    return serverError('Could not retrieve patient data');
  }
};
