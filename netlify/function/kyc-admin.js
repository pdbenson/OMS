// netlify/functions/kyc-admin.js
//
// Admin-only endpoint for KYC review operations.
// Uses service role key — never expose this client-side.
//
// AUTH: Authorization: Bearer <session_token> header (canonical)
//       OR body.adminKey (legacy, transition window only)
//
// REQUIRED ENV VARS:
//   SUPABASE_URL             — https://aqskltkvqlhcqwortjio.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY
//   TAPAT_ADMIN_KEY          — legacy fallback during admin.html cutover
//   STRIPE_SECRET_KEY        — for KYC-rejection ACH refund flow (Session 10)
//
// ACTIONS:
//   list            — returns pending KYC submissions with user info + signed doc URLs
//   approve         — sets submission_status = 'approved', kyc_status = 'verified',
//                     AND triggers release_held_ach_loads()
//   reject          — sets submission_status = 'rejected', kyc_status = 'unverified',
//                     AND triggers cancel_held_ach_loads() + Stripe refunds
//   needs_info      — sets submission_status = 'needs_info' (requests resubmission)
//
// SCHEMA NOTES (2026-05-12 fix):
//   The kyc_submissions table uses `submission_status` (not `status`) and
//   `gov_id_front_path` / `gov_id_back_path` (not `id_front_path` / `id_back_path`).
//   Address is now stored across 6 fields: address_line1, address_line2, city,
//   state_province, postal_code, country. id_expiry was added in the same migration.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./_admin-auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SIGNED_URL_EXPIRES = 3600; // 1 hour

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Auth: session token + role='admin', or legacy adminKey ───────────────
  const auth = await requireAdmin(event, sb);
  if (auth.error) return auth.error;

  const { action, submissionId, userId, adminNotes } = body;

  // ── LIST pending submissions ──────────────────────────────
  if (action === 'list') {
    const { data: subs, error } = await sb
      .from('kyc_submissions')
      .select(`
        id, user_id, submission_status, id_type, id_number, id_expiry,
        date_of_birth, address_line1, address_line2, city, state_province,
        postal_code, country, gov_id_front_path, gov_id_back_path,
        selfie_path, admin_notes, submitted_at,
        users!kyc_submissions_user_id_fkey(
          first_name, last_name, email, country, kyc_status, created_at
        )
      `)
      .eq('submission_status', 'pending')
      .order('submitted_at', { ascending: true });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    const results = await Promise.all((subs || []).map(async (sub) => {
      const urls = {};
      for (const [key, path] of [
        ['id_front', sub.gov_id_front_path],
        ['id_back',  sub.gov_id_back_path],
        ['selfie',   sub.selfie_path],
      ]) {
        if (path) {
          const { data } = await sb.storage
            .from('kyc-documents')
            .createSignedUrl(path, SIGNED_URL_EXPIRES);
          urls[key] = data?.signedUrl || null;
        }
      }
      return { ...sub, signed_urls: urls };
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions: results }),
    };
  }

  // ── APPROVE / REJECT / NEEDS_INFO ────────────────────────
  if (['approve', 'reject', 'needs_info'].includes(action)) {
    if (!submissionId || !userId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'submissionId and userId required' }) };
    }

    const kycStatus = action === 'approve' ? 'verified' :
                      action === 'reject'   ? 'unverified' : 'unverified';
    const subStatus = action === 'approve' ? 'approved' :
                      action === 'reject'   ? 'rejected'  : 'needs_info';

    const { error: subErr } = await sb
      .from('kyc_submissions')
      .update({
        submission_status: subStatus,
        admin_notes:       adminNotes || null,
        reviewed_at:       new Date().toISOString(),
      })
      .eq('id', submissionId);

    if (subErr) return { statusCode: 500, body: JSON.stringify({ error: subErr.message }) };

    await sb.from('users')
      .update({ kyc_status: kycStatus })
      .eq('id', userId);

    await sb.from('user_risk_profiles')
      .update({ kyc_status: kycStatus })
      .eq('user_id', userId);

    // ── Held ACH load handling (Session 10) ─────────────────────────────
    let achResult = null;

    if (action === 'approve') {
      try {
        const { data, error } = await sb.rpc('release_held_ach_loads', { p_user_id: userId });
        if (error) throw error;
        achResult = { type: 'released', data };
        console.log(`kyc-admin: released ${data?.released_count || 0} held ACH loads for user ${userId}`);
      } catch (err) {
        console.error('kyc-admin: release_held_ach_loads failed (non-fatal)', err);
        achResult = { type: 'release_failed', error: err.message };
      }
    } else if (action === 'reject') {
      try {
        const { data, error } = await sb.rpc('cancel_held_ach_loads', { p_user_id: userId });
        if (error) throw error;

        const piIds = data?.payment_intent_ids || [];
        const refundResults = [];

        for (const piId of piIds) {
          try {
            const refund = await stripe.refunds.create({
              payment_intent: piId,
              reason: 'fraudulent',
              metadata: {
                reason: 'kyc_rejected',
                user_id: userId,
                admin_notes: adminNotes || '',
              },
            });
            refundResults.push({ pi: piId, refund_id: refund.id, status: refund.status });
            console.log(`kyc-admin: refunded ${piId} → ${refund.id}`);
          } catch (refundErr) {
            console.error(`kyc-admin: refund failed for ${piId}`, refundErr.message);
            refundResults.push({ pi: piId, error: refundErr.message });
          }
        }

        achResult = { type: 'cancelled', cancelled: data, refunds: refundResults };
        console.log(`kyc-admin: cancelled ${piIds.length} held ACH loads for user ${userId}, issued ${refundResults.filter(r => r.refund_id).length} refunds`);
      } catch (err) {
        console.error('kyc-admin: cancel_held_ach_loads failed (non-fatal)', err);
        achResult = { type: 'cancel_failed', error: err.message };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, action, kycStatus, achResult }),
    };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
};
