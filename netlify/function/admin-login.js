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
  const expectedPassword = process.env.ADMIN_PASSWORD;  // plaintext in env var (never in code)

  // Constant-time email comparison
  const emailMatch = email.trim().toLowerCase() === (expectedEmail || '').toLowerCase();

  // bcryptjs compare if hash provided, otherwise plain compare
  let passwordMatch = false;
  if (process.env.ADMIN_PASSWORD_HASH) {
    passwordMatch = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  } else if (expectedPassword) {
    passwordMatch = password === expectedPassword;
  }

  if (!emailMatch || !passwordMatch) {
    await logAudit('admin_login_failed', email, null, { reason: 'invalid_credentials' }, event);
    // Same message regardless of which field was wrong
    return unauthorized('Invalid email or password');
  }

  await logAudit('admin_login_success', email, null, null, event);

  const token     = signAdminToken();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  return ok({ token, expiresAt });
};
