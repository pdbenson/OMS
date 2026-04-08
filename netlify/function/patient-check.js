'use strict';
const { supabase, ok, badRequest, serverError, handleOptions } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const email = event.queryStringParameters?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return badRequest('Valid email required');
  }

  try {
    const { data, error } = await supabase
      .from('patients')
      .select('id, status, edition_number, first_name, last_name')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    return ok({
      exists: !!data,
      status: data?.status || null,
      name:   data ? `${data.first_name || ''} ${data.last_name || ''}`.trim() : null,
    });
  } catch (e) {
    console.error('[patient-check]', e);
    return serverError('Could not check patient record');
  }
};
