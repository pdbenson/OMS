'use strict';
const { supabase, ok, badRequest, unauthorized, serverError, handleOptions, requireAdmin, logAudit } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!requireAdmin(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { staffId } = body;
  if (!staffId) return badRequest('staffId required');

  try {
    const { data: staff, error: findErr } = await supabase
      .from('staff').select('email, first_name, last_name').eq('id', staffId).single();
    if (findErr) throw findErr;

    const { error } = await supabase
      .from('staff').update({ active: false }).eq('id', staffId);
    if (error) throw error;

    await logAudit('staff_removed', process.env.ADMIN_EMAIL, staff.email, { staffId }, event);
    return ok({ removed: true });
  } catch (e) {
    console.error('[admin-staff-remove]', e);
    return serverError('Could not remove staff member');
  }
};
