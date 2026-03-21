-- Central132 Backend Schema
-- Supabase (PostgreSQL + PostGIS)
-- Idempotente: seguro de ejecutar múltiples veces

CREATE EXTENSION IF NOT EXISTS postgis;

-- Incidentes de emergencia (dato híbrido: columnas + raw JSON)
CREATE TABLE IF NOT EXISTS incidents (
  id            INTEGER PRIMARY KEY,
  fecha         TIMESTAMPTZ NOT NULL,
  clave         VARCHAR(20) NOT NULL,
  comuna        VARCHAR(100) NOT NULL,
  ubicacion     TEXT,
  location      GEOGRAPHY(Point, 4326),
  cuerpo        VARCHAR(150),
  carros        VARCHAR(500),
  raw_feature   JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_fecha ON incidents (fecha);
CREATE INDEX IF NOT EXISTS idx_incidents_clave ON incidents (clave);
CREATE INDEX IF NOT EXISTS idx_incidents_comuna ON incidents (comuna);
CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST (location);

-- Historial de cambios (cuando los carros despachados cambian)
CREATE TABLE IF NOT EXISTS incident_changes (
  id           SERIAL PRIMARY KEY,
  incident_id  INTEGER NOT NULL REFERENCES incidents (id),
  field        VARCHAR(50) NOT NULL,
  old_value    TEXT,
  new_value    TEXT NOT NULL,
  changed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changes_incident ON incident_changes (incident_id);
CREATE INDEX IF NOT EXISTS idx_changes_changed_at ON incident_changes (changed_at);
