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

function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function sendAdminNotification(patient) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const firstName = patient.first_name || '';
  const lastName  = patient.last_name  || '';
  const email     = patient.email      || '';
  const submitted = new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  await transporter.sendMail({
    from: '"Davis Center OMS" <info.davisoms@gmail.com>',
    to: process.env.ADMIN_NOTIFY_EMAIL,
    subject: `New Preregistration Completed — ${firstName} ${lastName}`,
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
                      Patient Preregistration Notification
                    </p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F3A5F;">
                      New Preregistration Completed
                    </p>
                    <p style="margin:0 0 24px;font-size:14px;color:#6b7a8d;">
                      A patient has finished all four intake forms and is ready for review.
                    </p>

                    <!-- Info box -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                      style="background:#f4f6f8;border-radius:6px;padding:0;margin-bottom:28px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding:6px 0;font-size:12px;color:#6b7a8d;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;width:120px;">
                                Patient
                              </td>
                              <td style="padding:6px 0;font-size:14px;color:#2E2E2E;font-weight:700;">
                                ${firstName} ${lastName}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:12px;color:#6b7a8d;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">
                                Email
                              </td>
                              <td style="padding:6px 0;font-size:14px;color:#2E2E2E;">
                                ${email}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:12px;color:#6b7a8d;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">
                                Submitted
                              </td>
                              <td style="padding:6px 0;font-size:14px;color:#2E2E2E;">
                                ${submitted}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:6px 0;font-size:12px;color:#6b7a8d;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">
                                Forms
                              </td>
                              <td style="padding:6px 0;font-size:14px;color:#2e8b57;font-weight:700;">
                                Patient Info &nbsp;&#10003;&nbsp; Insurance &nbsp;&#10003;&nbsp; Health History &nbsp;&#10003;&nbsp; HIPAA &nbsp;&#10003;
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${process.env.SITE_URL}"
                            style="display:inline-block;background:#3A7CA5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:6px;letter-spacing:0.03em;">
                            View Patient in Admin Portal &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
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
                      This notification contains no protected health information (PHI).<br>
                      Log in to the admin portal to view full patient details.
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
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = verifyToken(event.headers.authorization || event.headers.Authorization);
  if (!token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { step, formData, signature } = body;
  const patientId = token.patientId;

  if (!patientId || !step) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing patientId or step' }) };
  }

  try {
    // Save form data for this step
    const { error: upsertError } = await supabase
      .from('form_data')
      .upsert({
        patient_id: patientId,
        step,
        data: formData || {},
        completed_at: new Date().toISOString(),
      }, { onConflict: 'patient_id,step' });

    if (upsertError) throw upsertError;

    // Save signature if provided
    if (signature) {
      const { error: sigError } = await supabase
        .from('signatures')
        .upsert({
          patient_id: patientId,
          step,
          signature_data: signature,
          signed_at: new Date().toISOString(),
        }, { onConflict: 'patient_id,step' });

      if (sigError) throw sigError;
    }

    // Update patient last_activity
    await supabase
      .from('patients')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', patientId);

    // Audit log
    await supabase.from('audit_log').insert({
      patient_id: patientId,
      action: `step_${step}_completed`,
      timestamp: new Date().toISOString(),
    });

    // Step 4 = all done — mark completed and send admin notification
    if (step === 4) {
      await supabase
        .from('patients')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        })
        .eq('id', patientId);

      // Fetch patient for email
      const { data: patient } = await supabase
        .from('patients')
        .select('email, first_name, last_name')
        .eq('id', patientId)
        .single();

      if (patient) {
        try {
          await sendAdminNotification(patient);
        } catch (emailErr) {
          // Log but don't fail the request if email errors
          console.error('[OMS] Admin notification email failed:', emailErr.message);
        }
      }
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, step }),
    };

  } catch (err) {
    console.error('[OMS] intake-submit error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    };
  }
};
