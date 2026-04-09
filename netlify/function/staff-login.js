'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, ok, badRequest, unauthorized, serverError, handleOptions, logAudit } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return badRequest('Email and password required');

  try {
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, email, first_name, last_name, password_hash, accepted_at, active')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (error) throw error;

    if (!staff || !staff.active) {
      await logAudit('staff_login_failed', email, null, { reason: 'not_found' }, event);
      return unauthorized('Invalid email or password');
    }

    if (!staff.accepted_at || !staff.password_hash) {
      return unauthorized('Account not yet activated. Please check your email for the invitation link.');
    }

    const match = await bcrypt.compare(password.trim(), staff.password_hash);
    if (!match) {
      await logAudit('staff_login_failed', email, null, { reason: 'wrong_password' }, event);
      return unauthorized('Invalid email or password');
    }

    const token = jwt.sign(
      { role: 'staff', staffId: staff.id, email: staff.email,
        name: `${staff.first_name} ${staff.last_name}` },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    await logAudit('staff_login_success', email, null, null, event);

    return ok({
      token,
      expiresAt: Date.now() + 15 * 60 * 1000,
      name: `${staff.first_name} ${staff.last_name}`,
      email: staff.email,
    });

  } catch (e) {
    console.error('[staff-login]', e);
    return serverError('Login failed');
  }
};
