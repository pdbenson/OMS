'use strict';
const {
  supabase, ok, unauthorized, serverError, handleOptions,
  requireAdmin, logAudit
} = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  if (!requireAdmin(event)) return unauthorized();

  const adminEmail = process.env.ADMIN_EMAIL;

  try {
    const { data: patients, error: pErr } = await supabase
      .from('patients')
      .select('id, email, first_name, last_name, status, edition_number, last_activity, completed_at, assigned_consents')
      .order('last_activity', { ascending: false });

    if (pErr) throw pErr;

    // Get form completion status for all patients
    const { data: forms, error: fErr } = await supabase
      .from('form_data')
      .select('patient_id, form_key, edition, done');

    if (fErr) throw fErr;

    // Index forms by patient
    const formsByPatient = {};
    for (const f of (forms || [])) {
      if (!formsByPatient[f.patient_id]) formsByPatient[f.patient_id] = {};
      // Only include current edition forms
      const patient = patients.find(p => p.id === f.patient_id);
      if (patient && f.edition === patient.edition_number) {
        formsByPatient[f.patient_id][f.form_key] = { done: f.done };
      }
    }

    const result = (patients || []).map(p => ({
      id:              p.id,
      email:           p.email,
      firstName:       p.first_name || '',
      lastName:        p.last_name  || '',
      status:          p.status,
      editionNumber:   p.edition_number,
      lastActivity:    p.last_activity,
      completedAt:     p.completed_at,
      assignedConsents: p.assigned_consents || [],
      forms:           formsByPatient[p.id] || {},
    }));

    await logAudit('admin_patients_list', adminEmail, null, { count: result.length }, event);

    return ok({ patients: result });
  } catch (e) {
    console.error('[admin-patients]', e);
    return serverError('Could not retrieve patients');
  }
};
