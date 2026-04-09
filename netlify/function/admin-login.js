'use strict';
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  'Content-Type':  'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, password } = body;
  if (!email || !password) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email and password required' }) };
  }

  const submittedEmail = email.trim().toLowerCase();
  const submittedPwd   = password.trim();

  // STEP 1: Check env-var admin (main admin account - info.davisoms@gmail.com)
  const envEmail = (process.env.ADMIN_EMAIL    || '').trim().toLowerCase();
  const envPwd   = (process.env.ADMIN_PASSWORD || '').trim();

  if (envEmail && submittedEmail === envEmail) {
    if (submittedPwd !== envPwd) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid email or password' }) };
    }
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const token = jwt.sign(
      { staffId: 'admin', email: submittedEmail, firstName: 'Admin', lastName: '', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    console.log('[admin-login] Main admin login success');
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ token, expiresAt, role: 'admin', firstName: 'Admin', lastName: '' }) };
  }

  // STEP 2: Check staff table (providers and staff accounts)
  try {
    const { data: staffMember, error: dbError } = await supabase
      .from('staff')
      .select('id, email, first_name, last_name, password_hash, role, active, accepted_at')
      .eq('email', submittedEmail)
      .single();

    if (dbError || !staffMember) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid email or password' }) };
    }

    if (!staffMember.active) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'This account has been deactivated. Contact your administrator.' }) };
    }

    if (!staffMember.accepted_at || !staffMember.password_hash) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Account not yet activated. Check your email for the invitation link.' }) };
    }

    const passwordValid = await bcrypt.compare(submittedPwd, staffMember.password_hash);
    if (!passwordValid) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid email or password' }) };
    }

    const expiresAt = Date.now() + 15 * 60 * 1000;
    const token = jwt.sign(
      { staffId: staffMember.id, email: staffMember.email, firstName: staffMember.first_name, lastName: staffMember.last_name, role: staffMember.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    console.log('[admin-login] Staff login success:', submittedEmail, '| role:', staffMember.role);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ token, expiresAt, role: staffMember.role, firstName: staffMember.first_name, lastName: staffMember.last_name }),
    };

  } catch (err) {
    console.error('[admin-login] Server error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server error. Please try again.' }) };
  }
};
