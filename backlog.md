## OMS — Deferred (added 2026-06-09)

### Email bounce detection (staff list item #1) — blocked on AWS console access
Design settled, code not yet built. SES (email-smtp.us-east-1.amazonaws.com) → SNS topic
for bounce + complaint notifications → new `ses-bounce-webhook.js` Netlify function →
sets `email_status` on patients (migration needed) → red "⚠ Email Bounced" badge in both
dashboards; `reminder-cron.js` skips flagged addresses; `admin-update-email.js` clears the
flag on correction (TODO comment already in that file). Webhook validates SNS TopicArn
(full signature verification deferred — would need npm dep in root package.json).
AWS setup ~15 min: SNS topic, point SES identity bounce/complaint notifications at it,
HTTPS subscription to webhook URL (auto-confirms).
RISK NOTE: reminder-cron now sends daily — repeated sends to bad addresses accumulate
bounces; SES suspends senders near ~5% bounce rate. Raise priority if invites bounce often.

### SMS appointment reminders (staff list item #11) — blocked on AWS + registration
Requires SMS opt-in checkbox at patient intake (consent stored on patient record).
AWS End User Messaging; Davis Center needs its OWN toll-free number + use-case
registration — cannot reuse TΛPΛT's (toll-free verification is use-case-specific).
Registration approval takes days-to-weeks; start that before building.

### Previously deferred (unchanged)
- Consent forms
- Per-staff-member activity tracking
