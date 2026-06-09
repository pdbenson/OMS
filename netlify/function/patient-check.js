'use strict';
// Multi-row-safe replacement for patient-check (item 3: emails may belong to
// multiple patients). Contract observed from index.html: GET ?email= → { exists, status }.
// NOTE: compare against the original in the repo before deploying — if the
// original does anything beyond this contract, fold it in.
const { supabase, ok, badRequest, serverError, handleOptions } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const email = (event.queryStringParameters?.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return badRequest('Valid email required');
  }

  try {
    // No .single()/.maybeSingle() — an email may match several family members
    const { data: rows, error } = await supabase
      .from('patients')
      .select('id, status, last_activity')
      .eq('email', email)
      .order('last_activity', { ascending: false })
      .limit(5);

    if (error) throw error;

    return ok({
      exists: !!(rows && rows.length),
      status: rows && rows.length ? rows[0].status : null,
      count:  rows ? rows.length : 0,
    });
  } catch (e) {
    console.error('[patient-check]', e);
    return serverError('Lookup failed');
  }
};
