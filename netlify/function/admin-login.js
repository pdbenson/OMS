'use strict';
const bcrypt = require('bcryptjs');
const {
  ok, badRequest, unauthorized, serverError, handleOptions,
  signAdminToken, logAudit
} = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return badRequest('Email and password required');

  const expectedEmail    = process.env.ADMIN_EMAIL;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  // Diagnostic logging (safe — no actual values revealed)
  console.log('[admin-login] ADMIN_EMAIL set:', !!expectedEmail, '| length:', (expectedEmail||'').length);
  console.log('[admin-login] ADMIN_PASSWORD set:', !!expectedPassword, '| length:', (expectedPassword||'').length);
  console.log('[admin-login] submitted email length:', email.trim().length);
  console.log('[admin-login] submitted password length:', password.trim().length);
  console.log('[admin-login] ADMIN_PASSWORD_HASH set:', !!process.env.ADMIN_PASSWORD_HASH);

  const emailMatch = email.trim().toLowerCase() === (expectedEmail || '').trim().toLowerCase();
  console.log('[admin-login] emailMatch:', emailMatch);

  let passwordMatch = false;
  if (process.env.ADMIN_PASSWORD_HASH) {
    passwordMatch = await bcrypt.compare(password.trim(), process.env.ADMIN_PASSWORD_HASH.trim());
    console.log('[admin-login] used bcrypt compare, match:', passwordMatch);
  } else if (expectedPassword) {
    passwordMatch = password.trim() === expectedPassword.trim();
    console.log('[admin-login] used plain compare, match:', passwordMatch);
  } else {
    console.log('[admin-login] ERROR: no ADMIN_PASSWORD or ADMIN_PASSWORD_HASH set');
  }

  if (!emailMatch || !passwordMatch) {
    await logAudit('admin_login_failed', email, null, { reason: 'invalid_credentials' }, event);
    return unauthorized('Invalid email or password');
  }

  await logAudit('admin_login_success', email, null, null, event);
  const token     = signAdminToken();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  return ok({ token, expiresAt });
};
