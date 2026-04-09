'use strict';
const bcrypt = require('bcryptjs');
const { supabase, ok, badRequest, serverError, handleOptions, logAudit } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { token, password } = body;
  if (!token || !password) return badRequest('Token and password required');
  if (password.length < 8) return badRequest('Password must be at least 8 characters');

  try {
    // Find staff by token
    const { data: staff, error: findErr } = await supabase
      .from('staff')
      .select('id, email, first_name, last_name, invited_at, accepted_at')
      .eq('invite_token', token)
      .eq('active', true)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!staff) return badRequest('Invalid or expired invitation link');
    if (staff.accepted_at) return badRequest('This invitation has already been used');

    // Check token not older than 48 hours
    const invitedAt = new Date(staff.invited_at);
    const hoursOld = (Date.now() - invitedAt.getTime()) / (1000 * 60 * 60);
    if (hoursOld > 48) return badRequest('This invitation link has expired. Please ask your admin for a new invitation.');

    // Hash password and activate account
    const passwordHash = await bcrypt.hash(password, 12);
    const { error: updateErr } = await supabase
      .from('staff')
      .update({
        password_hash: passwordHash,
        accepted_at:   new Date().toISOString(),
        invite_token:  null, // invalidate token
      })
      .eq('id', staff.id);

    if (updateErr) throw updateErr;

    await logAudit('staff_accepted_invite', staff.email, null, { staffId: staff.id }, event);

    return ok({
      success: true,
      name: `${staff.first_name} ${staff.last_name}`,
      email: staff.email,
    });

  } catch (e) {
    console.error('[staff-accept]', e);
    return serverError('Could not set password: ' + e.message);
  }
};
