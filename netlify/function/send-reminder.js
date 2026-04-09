const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function verifyAdminToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    return decoded.role === 'admin' ? decoded : null;
  } catch {
    return null;
  }
}

function formatAppointmentDate(dateStr, timeStr) {
  try {
    const date = new Date(`${dateStr}T${timeStr || '00:00'}`);
    const dayFull = date.toLocaleDateString('en-US', {
      timeZone: 'America/Denver',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!timeStr) return dayFull;
    const timeFmt = date.toLocaleTimeString('en-US', {
      timeZone: 'America/Denver',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dayFull} at ${timeFmt}`;
  } catch {
    return `${dateStr}${timeStr ? ' at ' + timeStr : ''}`;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Admin-only endpoint
  const token = verifyAdminToken(event.headers.authorization || event.headers.Authorization);
  if (!token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { patientId, appointmentDate, appointmentTime } = body;

  if (!patientId || !appointmentDate) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Missing patientId or appointmentDate' }),
    };
  }

  try {
    // Fetch patient — only what we need, no excess PHI
    const { data: patient, error: ptError } = await supabase
      .from('patients')
      .select('id, email, first_name, last_name, status')
      .eq('id', patientId)
      .single();

    if (ptError || !patient) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Patient not found' }) };
    }

    // Save appointment date to patient record
    await supabase
      .from('patients')
      .update({
        appointment_date: appointmentDate,
        last_activity: new Date().toISOString(),
      })
      .eq('id', patientId);

    // Audit log
    await supabase.from('audit_log').insert({
      patient_id: patientId,
      action: 'reminder_sent',
      performed_by: token.email || 'admin',
      timestamp: new Date().toISOString(),
    });

    const firstName   = patient.first_name || 'Patient';
    const isComplete  = patient.status === 'completed';
    const apptDisplay = formatAppointmentDate(appointmentDate, appointmentTime);
    const portalUrl   = process.env.SITE_URL || 'https://oms.tapat.dev';

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const ctaLabel  = isComplete ? 'View Your Forms' : 'Complete Your Preregistration';
    const bodyIntro = isComplete
      ? `Your preregistration is complete. We look forward to seeing you at your upcoming appointment.`
      : `You have an appointment coming up and we still need your preregistration forms completed before you arrive. It only takes a few minutes to complete online.`;

    await transporter.sendMail({
      from: '"Davis Center OMS" <info.davisoms@gmail.com>',
      to: patient.email,
      subject: `Your Appointment — ${apptDisplay}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
            <tr>
              <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 14px rgba(31,58,95,0.10);">

                  <!-- Header -->
                  <tr>
                    <td style="background:#1F3A5F;padding:24px 32px;text-align:center;">
                      <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">
                        Davis Center for Oral and Maxillofacial Surgery
                      </p>
                      <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">
                        Paul Benson, DMD, MD
                      </p>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:32px;">
                      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1F3A5F;">
                        Hi ${firstName},
                      </p>
                      <p style="margin:0 0 24px;font-size:14px;color:#2E2E2E;line-height:1.6;">
                        ${bodyIntro}
                      </p>

                      <!-- Appointment box -->
                      <table width="100%" cellpadding="0" cellspacing="0"
                        style="background:#f4f6f8;border-left:4px solid #3A7CA5;border-radius:0 6px 6px 0;margin-bottom:28px;">
                        <tr>
                          <td style="padding:18px 24px;">
                            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7a8d;text-transform:uppercase;letter-spacing:0.08em;">
                              Your Appointment
                            </p>
                            <p style="margin:0;font-size:16px;font-weight:700;color:#1F3A5F;">
                              ${apptDisplay}
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                        <tr>
                          <td align="center">
                            <a href="${portalUrl}"
                              style="display:inline-block;background:#3A7CA5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:6px;letter-spacing:0.03em;">
                              ${ctaLabel} &rarr;
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;font-size:13px;color:#6b7a8d;line-height:1.6;">
                        If you have any questions before your appointment, please don't hesitate to call us at
                        <strong style="color:#2E2E2E;">(801) 614-0999</strong>.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:#f4f6f8;padding:18px 32px;text-align:center;border-top:1px solid #d4dde6;">
                      <p style="margin:0;font-size:11px;color:#6b7a8d;line-height:1.8;">
                        Davis Center for Oral and Maxillofacial Surgery<br>
                        890 W Heritage Park Blvd, Suite 103 &middot; Layton, Utah 84041<br>
                        (801) 614-0999 &middot; info.davisoms@gmail.com
                      </p>
                      <p style="margin:8px 0 0;font-size:10px;color:#aab8c4;">
                        This message does not contain your personal health information.<br>
                        Please do not reply to this email — call us directly if you need assistance.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, sentTo: patient.email }),
    };

  } catch (err) {
    console.error('[OMS] send-reminder error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    };
  }
};
