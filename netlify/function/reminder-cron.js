'use strict';
// Scheduled function — runs daily (see netlify.toml: [functions."reminder-cron"] schedule).
// Sends preregistration reminders to patients whose forms are not complete:
//   * weekly while the appointment is more than 7 days away
//   * daily once inside 7 days, up to and including the morning of the appointment
// Stops automatically when: forms submitted (status='completed'), staff marks
// intake complete, the appointment date passes, or there is no appointment set.
// Both this cron and the manual Remind button stamp last_reminder_sent_at,
// so a manual reminder resets the clock and same-day duplicates can't happen.

const nodemailer = require('nodemailer');
const { supabase, ok, serverError } = require('./_utils');
const { buildReminderEmail, formatAppointment } = require('./_reminder-email');

const CLINIC_TZ = 'America/Denver';
const MAX_SENDS_PER_RUN = 100; // safety cap

function todayClinicISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

function daysBetweenISO(fromISO, toISO) {
  // Whole-day difference between two YYYY-MM-DD strings
  return Math.round((Date.parse(toISO + 'T12:00:00Z') - Date.parse(fromISO + 'T12:00:00Z')) / 86400000);
}

exports.handler = async () => {
  if (!process.env.SMTP_HOST) {
    console.log('[reminder-cron] SMTP not configured — skipping run');
    return ok({ sent: 0, skipped: 'no smtp' });
  }

  const today = todayClinicISO();
  const siteUrl = process.env.SITE_URL || 'https://oms.tapat.dev';

  try {
    // Candidates: appointment today or later, forms not submitted, intake not marked complete
    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, email, first_name, status, appointment_date, appointment_time, intake_complete_at, last_reminder_sent_at')
      .neq('status', 'completed')
      .is('intake_complete_at', null)
      .not('appointment_date', 'is', null)
      .gte('appointment_date', today);

    if (error) throw error;

    const due = (patients || []).filter(p => {
      if (!p.email) return false;
      const daysUntil = daysBetweenISO(today, p.appointment_date);
      const cadenceDays = daysUntil > 7 ? 7 : 1;
      if (!p.last_reminder_sent_at) return true;
      const daysSinceLast = (Date.now() - Date.parse(p.last_reminder_sent_at)) / 86400000;
      // 0.5-day grace keeps a fixed daily run time from drifting past its own threshold
      return daysSinceLast >= cadenceDays - 0.5;
    }).slice(0, MAX_SENDS_PER_RUN);

    if (!due.length) {
      console.log('[reminder-cron] no reminders due (' + (patients || []).length + ' candidates)');
      return ok({ sent: 0, candidates: (patients || []).length });
    }

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    let sent = 0;
    const failures = [];

    for (const p of due) {
      try {
        const { dayStr, timeStr } = formatAppointment(p.appointment_date, p.appointment_time);
        const { subject, html, text } = buildReminderEmail({
          firstName: p.first_name, dayStr, timeStr, siteUrl,
        });

        await transporter.sendMail({
          from: `"Davis Center for OMS" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to:   p.email,
          subject, html, text,
        });

        const now = new Date().toISOString();
        await supabase.from('patients')
          .update({ last_reminder_sent_at: now })
          .eq('id', p.id);

        await supabase.from('audit_log').insert({
          action:        'auto_reminder_sent',
          actor_email:   'reminder-cron',
          patient_email: p.email,
          details:       { patientId: p.id, apptDate: p.appointment_date, daysUntil: daysBetweenISO(today, p.appointment_date) },
          ip_address:    'scheduled',
        });

        sent++;
      } catch (e) {
        console.error('[reminder-cron] send failed for', p.email, '-', e.message);
        failures.push(p.email);
        // last_reminder_sent_at NOT updated on failure — retried next run
      }
    }

    console.log(`[reminder-cron] sent ${sent}/${due.length}` + (failures.length ? ' failures: ' + failures.join(', ') : ''));
    return ok({ sent, attempted: due.length, failures });
  } catch (e) {
    console.error('[reminder-cron]', e);
    return serverError('Reminder cron failed');
  }
};
