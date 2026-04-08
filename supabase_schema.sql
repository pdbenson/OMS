-- ============================================================
-- OMS Intake — Supabase Schema
-- Davis Center for Oral and Maxillofacial Surgery
-- Run this in the Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- ── PATIENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT UNIQUE NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  dob              TEXT,           -- used for identity verification only
  status           TEXT NOT NULL DEFAULT 'draft',  -- draft | in_progress | completed
  edition_number   INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  assigned_consents TEXT[] NOT NULL DEFAULT '{}'
);

-- ── FORM DATA ─────────────────────────────────────────────
-- One row per form section (pi, ins, hh, hipaa) per patient per edition
CREATE TABLE IF NOT EXISTS form_data (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  form_key     TEXT NOT NULL,   -- pi | ins | hh | hipaa
  edition      INTEGER NOT NULL DEFAULT 1,
  data         JSONB,           -- form field values (no SSNs)
  yn_map       JSONB,           -- yes/no answers
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, form_key, edition)
);

-- ── SIGNATURES ────────────────────────────────────────────
-- Stored separately due to size (base64 canvas data)
CREATE TABLE IF NOT EXISTS signatures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  sig_key      TEXT NOT NULL,   -- fin | priv | ins | hh | hipaa
  edition      INTEGER NOT NULL DEFAULT 1,
  data_url     TEXT NOT NULL,   -- base64 canvas PNG
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, sig_key, edition)
);

-- ── AUDIT LOG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action        TEXT NOT NULL,
  actor_email   TEXT,           -- admin email or 'patient'
  patient_email TEXT,
  details       JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patients_email       ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_status      ON patients(status);
CREATE INDEX IF NOT EXISTS idx_form_data_patient    ON form_data(patient_id);
CREATE INDEX IF NOT EXISTS idx_signatures_patient   ON signatures(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_patient        ON audit_log(patient_email);

-- ── ROW LEVEL SECURITY ────────────────────────────────────
-- All access goes through Netlify functions using the service role key.
-- RLS is defense-in-depth — prevents direct DB access bypassing functions.

ALTER TABLE patients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_data     ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by Netlify functions)
-- Anon role has NO access to any table
-- This means zero data exposure if an API key is ever leaked

CREATE POLICY "service_role_only" ON patients   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON form_data  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON signatures FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON audit_log  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── HELPER FUNCTIONS ─────────────────────────────────────
-- Automatically update updated_at on form_data changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_data_updated_at
  BEFORE UPDATE ON form_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── VERIFY SETUP ─────────────────────────────────────────
-- Run this after the above to confirm tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
