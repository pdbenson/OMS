# OMS Intake — Deployment Guide
## Davis Center for Oral and Maxillofacial Surgery

---

## Prerequisites Checklist
Before deploying, confirm you have:
- [ ] Supabase project created
- [ ] GitHub repository created
- [ ] Netlify site connected to GitHub repo

---

## Step 1 — Supabase Database Setup

1. Open your Supabase project → **SQL Editor**
2. Paste the entire contents of `supabase_schema.sql` and click **Run**
3. Confirm success: go to **Table Editor** and verify these tables exist:
   - `patients`
   - `form_data`
   - `signatures`
   - `audit_log`
4. Go to **Settings → API** and copy:
   - **Project URL** → you'll need this as `SUPABASE_URL`
   - **service_role** key (secret) → `SUPABASE_SERVICE_ROLE_KEY`
   - ⚠️ Do NOT use the `anon` key — always use `service_role` for the functions

---

## Step 2 — Generate JWT Secret

Open any terminal and run:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```
Save the output as `JWT_SECRET`. Keep it secret.

---

## Step 3 — Set Environment Variables in Netlify

Go to **Netlify → Site Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://YOURPROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `JWT_SECRET` | Generated in Step 2 |
| `ADMIN_EMAIL` | `info.davisoms@gmail.com` |
| `ADMIN_PASSWORD` | `D@vis890!` |
| `SITE_URL` | `https://oms.tapat.dev` |
| `SMTP_HOST` | Your HIPAA-compliant SMTP host (see Email section) |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | Your SMTP username |
| `SMTP_PASS` | Your SMTP password |
| `SMTP_FROM` | `noreply@davisoms.com` |

---

## Step 4 — Configure Custom Domain

In Netlify → **Domain Management**:
1. Add custom domain: `oms.tapat.dev`
2. Add CNAME record in your DNS: `oms` → `[your-netlify-site].netlify.app`
3. Netlify will provision SSL automatically (give it a few minutes)

---

## Step 5 — Deploy

Push to GitHub. Netlify auto-deploys on every push to `main`.

To trigger a manual deploy: Netlify → **Deploys → Trigger Deploy**

---

## Step 6 — Verify Deployment

Test these URLs after deploy:
- `https://oms.tapat.dev/` → Landing page loads
- `https://oms.tapat.dev/.netlify/functions/patient-check?email=test@test.com` → Returns `{"exists":false}`
- Admin login with `info.davisoms@gmail.com` / `D@vis890!` → Dashboard loads

---

## Email Setup (HIPAA-Compliant)

Admin notification emails contain **NO PHI** — only a notification that a new form was submitted, with a link to log in.

**Recommended: Paubox** (purpose-built for HIPAA, includes BAA)
1. Sign up at paubox.com/plans (HIPAA Basic starts ~$29/mo)
2. Get SMTP credentials from your Paubox account
3. Request and sign their BAA through the Paubox portal

**Alternative: AWS SES** (HIPAA-eligible under AWS BAA)
1. Enable SES in AWS console
2. Verify your sending domain
3. Sign the AWS BAA in your AWS account
4. Use SMTP credentials from SES

---

## Security Notes

- **Admin password** is stored only in Netlify environment variables (never in code or browser)
- **Admin sessions** expire automatically after 15 minutes of inactivity
- **Patient tokens** expire after 24 hours
- **PHI** is stored only in Supabase (encrypted at rest, RLS enabled)
- **No PHI** is ever stored in `localStorage`, `sessionStorage`, cookies, or email bodies
- **Audit log** records every admin login, patient data access, and form submission
- **SSN fields** have been intentionally removed — if billing requires them, collect separately

---

## Self-Host Fonts (Optional — Removes Google Fonts)

For full network privacy (no patient IP sent to Google):

1. Download fonts from Google Fonts:
   - https://fonts.google.com/specimen/Libre+Baskerville
   - https://fonts.google.com/specimen/Nunito
2. Place `.woff2` files in `/fonts/` directory
3. Replace the Google Fonts `<link>` in `index.html` with:

```css
@font-face {
  font-family: 'Libre Baskerville';
  src: url('/fonts/LibreBaskerville-Regular.woff2') format('woff2');
  font-weight: 400; font-style: normal;
}
@font-face {
  font-family: 'Libre Baskerville';
  src: url('/fonts/LibreBaskerville-Bold.woff2') format('woff2');
  font-weight: 700; font-style: normal;
}
@font-face {
  font-family: 'Nunito';
  src: url('/fonts/Nunito-Variable.woff2') format('woff2');
  font-weight: 300 700; font-style: normal;
}
```

---

## Connecting to OMSVision (Future)

When Henry Schein confirms API access for patient registration, add a new function:
`netlify/functions/omsvision-register.js`

Call it from `intake-submit.js` on final submission (`isFinal === true`).
The patient data is already structured and ready — the `form_data` table contains
everything OMSVision would need to create a chart.

---

## Support

OMS Intake is built on TAPAT Connect (Tier 4 API client).
For TAPAT integration support: paul@tapat.dev
