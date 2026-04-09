'use strict';
const { supabase, ok, unauthorized, serverError, handleOptions, requireAdmin } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!requireAdmin(event)) return unauthorized();

  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id, email, first_name, last_name, role, invited_at, accepted_at, active, invited_by')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return ok({ staff: data || [] });
  } catch (e) {
    console.error('[admin-staff-list]', e);
    return serverError('Could not retrieve staff list');
  }
};
