'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requireAdmin, logAudit
} = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  if (!requireAdmin(event)) return unauthorized();

  const patientId = event.queryStringParameters?.patientId;
  if (!patientId) return badRequest('patientId required');

  const adminEmail = process.env.ADMIN_EMAIL;

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (pErr) throw pErr;
    if (!patient) return badRequest('Patient not found');

    // All editions of form data
    const { data: forms, error: fErr } = await supabase
      .from('form_data')
      .select('*')
      .eq('patient_id', patientId)
      .order('edition', { ascending: true });

    if (fErr) throw fErr;

    // Signatures for current edition
    const { data: sigs, error: sErr } = await supabase
      .from('signatures')
      .select('sig_key, data_url, edition')
      .eq('patient_id', patientId)
      .eq('edition', patient.edition_number);

    if (sErr) throw sErr;

    // Organise by edition then form_key
    const editions = {};
    for (const f of (forms || [])) {
      if (!editions[f.edition]) editions[f.edition] = {};
      editions[f.edition][f.form_key] = {
        done:        f.done,
        data:        f.data || {},
        ynMap:       f.yn_map || {},
        completedAt: f.completed_at,
      };
    }

    const sigMap = {};
    for (const s of (sigs || [])) sigMap[s.sig_key] = s.data_url;

    await logAudit('admin_patient_viewed', adminEmail, patient.email, { patientId }, event);

    return ok({
      patient: {
        id:              patient.id,
        email:           patient.email,
        firstName:       patient.first_name  || '',
        lastName:        patient.last_name   || '',
        status:          patient.status,
        editionNumber:   patient.edition_number,
        lastActivity:    patient.last_activity,
        completedAt:     patient.completed_at,
        assignedConsents: patient.assigned_consents || [],
        createdAt:       patient.created_at,
      },
      currentForms: editions[patient.edition_number] || {},
      signatures:   sigMap,
      allEditions:  editions,
    });
  } catch (e) {
    console.error('[admin-patient-detail]', e);
    return serverError('Could not retrieve patient detail');
  }
};
