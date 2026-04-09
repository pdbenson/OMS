const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, password } = body;

  if (!email || !password) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Email and password are required' }),
    };
  }

  try {
    // Look up staff member by email
    const { data: staffMember, error: dbError } = await supabase
      .from('staff')
      .select('id, email, first_name, last_name, password_hash, role, active')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (dbError || !staffMember) {
      console.log('[admin-login] Email not found:', email);
      return {
        statusCode: 401,
        headers: CORS,
        body: JSON.stringify({ error: 'Invalid email or password' }),
      };
    }

    // Check account is active
    if (!staffMember.active) {
      console.log('[admin-login] Inactive account:', email);
      return {
        statusCode: 401,
        headers: CORS,
        body: JSON.stringify({ error: 'This account has been deactivated. Please contact your administrator.' }),
      };
    }

    // Verify password against bcrypt hash
    const passwordValid = await bcrypt.compare(password, staffMember.password_hash);

    if (!passwordValid) {
      console.log('[admin-login] Password mismatch for:', email);
      return {
        statusCode: 401,
        headers: CORS,
        body: JSON.stringify({ error: 'Invalid email or password' }),
      };
    }

    // Issue 15-minute JWT
    const token = jwt.sign(
      {
        staffId: staffMember.id,
        email: staffMember.email,
        firstName: staffMember.first_name,
        lastName: staffMember.last_name,
        role: staffMember.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    console.log('[admin-login] Login success:', email, '| role:', staffMember.role);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        token,
        role: staffMember.role,
        firstName: staffMember.first_name,
        lastName: staffMember.last_name,
      }),
    };

  } catch (err) {
    console.error('[admin-login] Server error:', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Server error. Please try again.' }),
    };
  }
};
