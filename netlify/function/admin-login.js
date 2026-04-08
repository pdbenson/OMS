'use strict';
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Content-Type': 'application/json' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, password } = body;
  if (!email || !password) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Email and password required' }) };
  }

  const expectedEmail    = (process.env.ADMIN_EMAIL    || '').trim().toLowerCase();
  const expectedPassword = (process.env.ADMIN_PASSWORD || '').trim();

  console.log('[admin-login] env ADMIN_EMAIL set:', !!process.env.ADMIN_EMAIL, 'len:', expectedEmail.length);
  console.log('[admin-login] env ADMIN_PASSWORD set:', !!process.env.ADMIN_PASSWORD, 'len:', expectedPassword.length);
  console.log('[admin-login] submitted email len:', email.trim().length, 'pw len:', password.trim().length);

  const emailMatch    = email.trim().toLowerCase() === expectedEmail;
  const passwordMatch = password.trim() === expectedPassword;

  console.log('[admin-login] emailMatch:', emailMatch, '| passwordMatch:', passwordMatch);

  if (!emailMatch || !passwordMatch) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Invalid email or password' }) };
  }

  const token     = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const expiresAt = Date.now() + 15 * 60 * 1000;

  console.log('[admin-login] login successful');
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ token, expiresAt }) };
};
