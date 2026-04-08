'use strict';
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// ── SUPABASE CLIENT ────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── HTTP HELPERS ───────────────────────────────────────────
const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

function ok(body)         { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(body) }; }
function created(body)    { return { statusCode: 201, headers: HEADERS, body: JSON.stringify(body) }; }
function badRequest(msg)  { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }
function unauthorized(msg){ return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: msg || 'Unauthorized' }) }; }
function forbidden(msg)   { return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: msg || 'Forbidden' }) }; }
function serverError(msg) { return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: msg || 'Internal server error' }) }; }

// ── JWT ────────────────────────────────────────────────────
function signPatientToken(patientId, email) {
  return jwt.sign(
    { sub: patientId, email, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function signAdminToken() {
  return jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function getBearerToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function requirePatient(event) {
  const token = getBearerToken(event);
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'patient') return null;
  return decoded; // { sub: patientId, email }
}

function requireAdmin(event) {
  const token = getBearerToken(event);
  if (!token) return false;
  const decoded = verifyToken(token);
  return decoded && decoded.role === 'admin';
}

// ── AUDIT LOG ──────────────────────────────────────────────
async function logAudit(action, actorEmail, patientEmail, details, event) {
  const ip = event?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
           || event?.headers?.['client-ip']
           || 'unknown';
  try {
    await supabase.from('audit_log').insert({
      action,
      actor_email:   actorEmail  || null,
      patient_email: patientEmail || null,
      details:       details || null,
      ip_address:    ip,
    });
  } catch (e) {
    console.error('[audit] failed to log:', e.message);
  }
}

// ── CORS PREFLIGHT ─────────────────────────────────────────
function handleOptions() {
  return {
    statusCode: 204,
    headers: {
      ...HEADERS,
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: '',
  };
}

module.exports = {
  supabase,
  ok, created, badRequest, unauthorized, forbidden, serverError,
  signPatientToken, signAdminToken, verifyToken, getBearerToken,
  requirePatient, requireAdmin,
  logAudit, handleOptions,
};
