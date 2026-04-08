'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requirePatient
} = require('./_utils');

const VALID_KEYS = ['pi', 'ins', 'hh', 'hipaa'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const decoded = requirePatient(event);
  if (!decoded) return unauthorized();
  const { sub: patientId } = decoded;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { formKey, data, ynMap, signatures } = body;

  if (!VALID_KEYS.includes(formKey)) return badRequest('Invalid form key');

  try {
    // Get current edition
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('edition_number, status')
      .eq('id', patientId)
      .single();

    if (pErr) throw pErr;
    const edition = patient.edition_number;

    // Upsert form data
    const { error: uErr } = await supabase
      .from('form_data')
      .upsert({
        patient_id: patientId,
        form_key:   formKey,
        edition,
        data:       data   || {},
        yn_map:     ynMap  || {},
        done:       false,
      }, { onConflict: 'patient_id,form_key,edition' });

    if (uErr) throw uErr;

    // Save any signatures included
    if (signatures && typeof signatures === 'object') {
      for (const [sigKey, dataUrl] of Object.entries(signatures)) {
        if (!dataUrl || typeof dataUrl !== 'string') continue;
        await supabase.from('signatures').upsert({
          patient_id: patientId,
          sig_key:    sigKey,
          edition,
          data_url:   dataUrl,
        }, { onConflict: 'patient_id,sig_key,edition' });
      }
    }

    // Update last_activity and status if still draft
    const updates = { last_activity: new Date().toISOString() };
    if (patient.status === 'draft') updates.status = 'draft';

    // Store DOB from pi form for future identity verification
    if (formKey === 'pi' && data?.dob) updates.dob = data.dob;
    if (formKey === 'pi' && data?.name) {
      const parts = (data.name || '').trim().split(/\s+/);
      updates.first_name = parts[0] || '';
      updates.last_name  = parts.length > 1 ? parts[parts.length - 1] : '';
    }

    await supabase.from('patients').update(updates).eq('id', patientId);

    return ok({ saved: true });
  } catch (e) {
    console.error('[draft-save]', e);
    return serverError('Could not save draft');
  }
};
