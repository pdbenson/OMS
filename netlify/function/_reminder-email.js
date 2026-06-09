'use strict';
// Shared preregistration-reminder email template.
// Used by send-reminder.js (manual, staff-triggered) and reminder-cron.js (automated).

function buildReminderEmail({ firstName, dayStr, timeStr, siteUrl }) {
  const name = firstName || 'Patient';
  const site = siteUrl || 'https://oms.tapat.dev';
  const subject = `Complete Your Preregistration — Appointment on ${dayStr} at ${timeStr}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Helvetica Neue',Arial,sans-serif;color:#2E2E2E">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

      <!-- HEADER -->
      <tr><td style="background:#1F3A5F;padding:24px 32px;text-align:center">
        <div style="font-size:1.1rem;font-weight:700;color:#ffffff;letter-spacing:.02em">Davis Center for Oral and Maxillofacial Surgery</div>
        <div style="font-size:.85rem;color:rgba(255,255,255,.7);margin-top:4px;font-style:italic">Paul Benson, DMD, MD</div>
      </td></tr>

      <!-- APPOINTMENT BANNER -->
      <tr><td style="background:#3A7CA5;padding:16px 32px;text-align:center">
        <div style="font-size:.78rem;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Your Upcoming Appointment</div>
        <div style="font-size:1.15rem;font-weight:700;color:#ffffff">${dayStr}</div>
        <div style="font-size:1rem;color:rgba(255,255,255,.9)">${timeStr}</div>
        <div style="font-size:.82rem;color:rgba(255,255,255,.85);margin-top:8px;line-height:1.5">890 W. Heritage Park Blvd., Suite 103<br>Layton, Utah 84041 &middot; (801) 614-0999</div>
      </td></tr>

      <!-- BODY -->
      <tr><td style="padding:32px 32px 24px">
        <p style="margin:0 0 16px;font-size:.95rem">Dear <strong>${name}</strong>,</p>
        <p style="margin:0 0 16px;font-size:.95rem;line-height:1.6">We look forward to seeing you at Davis Center for Oral and Maxillofacial Surgery on <strong>${dayStr} at ${timeStr}</strong>.</p>
        <p style="margin:0 0 20px;font-size:.95rem;line-height:1.6">To help us prepare for your visit and keep your appointment running smoothly, please complete your patient preregistration forms before you arrive. It takes about 10&ndash;15 minutes and can be done from any device.</p>

        <!-- CTA BUTTON -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
          <tr><td align="center">
            <a href="${site}" style="display:inline-block;background:#3A7CA5;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:6px;font-weight:700;font-size:.95rem;letter-spacing:.02em">Complete My Preregistration &rarr;</a>
          </td></tr>
          <tr><td align="center" style="padding-top:8px">
            <span style="font-size:.75rem;color:#6b7a8d">${site}</span>
          </td></tr>
        </table>

        <p style="margin:0 0 12px;font-size:.85rem;color:#6b7a8d;line-height:1.6">If you have already submitted your forms, please disregard this message.</p>
        <p style="margin:0 0 24px;font-size:.85rem;color:#6b7a8d;line-height:1.6">If you have any questions or need to reschedule, please call us at <strong style="color:#2E2E2E">(801) 614-0999</strong>.</p>

        <p style="margin:0 0 4px;font-size:.92rem">We look forward to seeing you soon.</p>
        <p style="margin:0;font-size:.92rem">Warm regards,</p>
      </td></tr>

      <!-- SIGNATURE -->
      <tr><td style="padding:0 32px 32px">
        <div style="border-top:1px solid #d4dde6;padding-top:16px">
          <strong style="font-size:.95rem;color:#1F3A5F">Davis Center for Oral and Maxillofacial Surgery</strong><br>
          <span style="font-size:.85rem;color:#6b7a8d">Paul Benson, DMD, MD</span><br>
          <span style="font-size:.82rem;color:#6b7a8d">890 W. Heritage Park Blvd., Suite 103 &middot; Layton, Utah 84041</span><br>
          <span style="font-size:.82rem;color:#6b7a8d">(801) 614-0999 &middot; info.davisoms@gmail.com</span>
        </div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#f4f6f8;padding:16px 32px;text-align:center;border-top:1px solid #d4dde6">
        <p style="margin:0;font-size:.72rem;color:#6b7a8d;line-height:1.6">This is an automated reminder from Davis Center for Oral and Maxillofacial Surgery.<br>You will continue to receive reminders until your preregistration is complete.<br>Please do not reply to this email. Call (801) 614-0999 for assistance.</p>
        <p style="margin:8px 0 0;font-size:.72rem;color:#aaa">&copy; 2026 Davis Center for Oral and Maxillofacial Surgery &middot; All Rights Reserved</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = `Dear ${name},\n\nWe look forward to seeing you at Davis Center for Oral and Maxillofacial Surgery on ${dayStr} at ${timeStr}.\n\nYour appointment:\n${dayStr} at ${timeStr}\n890 W. Heritage Park Blvd., Suite 103, Layton, Utah 84041\n(801) 614-0999\n\nTo help us prepare for your visit, please complete your patient preregistration forms before you arrive. Visit: ${site}\n\nIf you have already submitted your forms, please disregard this message.\n\nIf you have any questions or need to reschedule, please call us at (801) 614-0999.\n\nWarm regards,\nDavis Center for Oral and Maxillofacial Surgery\nPaul Benson, DMD, MD\n890 W. Heritage Park Blvd., Suite 103 · Layton, Utah 84041\n(801) 614-0999 · info.davisoms@gmail.com`;

  return { subject, html, text };
}

// Formats "YYYY-MM-DD" + "HH:MM[:SS]" into the strings used in the email,
// without timezone pitfalls (appointment values are clinic wall-clock).
function formatAppointment(apptDate, apptTime) {
  const d = new Date(apptDate + 'T12:00:00'); // noon guards against date rollover
  const dayStr = isNaN(d) ? apptDate : d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  let timeStr = 'your scheduled time';
  if (apptTime) {
    const [hStr, mStr] = apptTime.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    timeStr = `${h}:${mStr} ${ampm}`;
  }
  return { dayStr, timeStr };
}

module.exports = { buildReminderEmail, formatAppointment };
