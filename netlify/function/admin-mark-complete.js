'use strict';
const {
  supabase, ok, badRequest, unauthorized, serverError, handleOptions,
  requireStaff, logAudit
} = require('./_utils');

// POST { patientId, complete: true|false }
// All admin tiers (admin, provider, staff) may mark intake complete or reopen it.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const actor = requireStaff(event);
  if (!actor) return unauthorized();
  const actorEmail = actor.email || process.env.ADMIN_EMAIL;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { patientId, complete } = body;
  if (!patientId) return badRequest('patientId required');
  if (typeof complete !== 'boolean') return badRequest('complete must be true or false');

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('id, email, intake_complete_at')
      .eq('id', patientId)
      .single();
    if (pErr) throw pErr;
    if (!patient) return badRequest('Patient not found');

    const now = new Date().toISOString();
    const updates = complete
      ? { intake_complete_at: now,  intake_complete_by: actorEmail, last_activity: now }
      : { intake_complete_at: null, intake_complete_by: null,       last_activity: now };

    const { error: uErr } = await supabase
      .from('patients')
      .update(updates)
      .eq('id', patientId);
    if (uErr) throw uErr;

    await logAudit(
      complete ? 'intake_marked_complete' : 'intake_reopened',
      actorEmail, patient.email, { patientId }, event
    );

    return ok({ patientId, intakeCompleteAt: complete ? now : null });
  } catch (e) {
    console.error('[admin-mark-complete]', e);
    return serverError('Could not update intake status');
  }
};
