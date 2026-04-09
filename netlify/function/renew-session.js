'use strict';
const jwt = require('jsonwebtoken');
const { handleOptions } = require('./_utils');

const CORS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  // Get the current token from the Authorization header
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  const currentToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!currentToken) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No token provided' }) };
  }

  try {
    // Verify the existing token (even if close to expiry, as long as it's still valid)
    const decoded = jwt.verify(currentToken, process.env.JWT_SECRET);

    // Issue a fresh token with the same payload but a new 15-minute window
    const { iat, exp, ...payload } = decoded; // strip old timestamps
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });

    console.log('[renew-session] Session renewed for:', decoded.email, '| role:', decoded.role);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ token: newToken, expiresAt, role: decoded.role }),
    };
  } catch (err) {
    // Token is invalid or expired — cannot renew
    return {
      statusCode: 401,
      headers: CORS,
      body: JSON.stringify({ error: 'Session has expired. Please log in again.' }),
    };
  }
};
