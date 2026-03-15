CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS foodbanks (
  id SERIAL PRIMARY KEY,
  name TEXT,
  organisation TEXT,
  address TEXT,
  postcode TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geom GEOGRAPHY(Point, 4326),
  phone TEXT,
  email TEXT,
  website TEXT,
  opening_hours TEXT,
  opening_hours_parsed JSONB,
  services JSONB,
  inventory_tags JSONB,
  ai_summary TEXT,
  ai_confidence DOUBLE PRECISION,
  ai_last_updated TIMESTAMP,
  referral_required BOOLEAN,
  referral_type TEXT NOT NULL DEFAULT 'unknown',
  notes TEXT,
  source TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (
    latitude IS NULL
    OR (latitude >= 49 AND latitude <= 61)
  ),
  CHECK (
    longitude IS NULL
    OR (longitude >= -9 AND longitude <= 3)
  )
);

ALTER TABLE foodbanks
  ADD COLUMN IF NOT EXISTS opening_hours_parsed JSONB;

ALTER TABLE foodbanks
  ADD COLUMN IF NOT EXISTS services JSONB;

ALTER TABLE foodbanks
  ADD COLUMN IF NOT EXISTS inventory_tags JSONB;

ALTER TABLE foodbanks
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;

ALTER TABLE foodbanks
  ADD COLUMN IF NOT EXISTS ai_confidence DOUBLE PRECISION;

ALTER TABLE foodbanks
  ADD COLUMN IF NOT EXISTS ai_last_updated TIMESTAMP;

ALTER TABLE foodbanks
  ADD COLUMN IF NOT EXISTS referral_type TEXT DEFAULT 'unknown';

UPDATE foodbanks
SET referral_type = 'unknown'
WHERE referral_type IS NULL;

ALTER TABLE foodbanks
  ALTER COLUMN referral_type SET DEFAULT 'unknown';

ALTER TABLE foodbanks
  ALTER COLUMN referral_type SET NOT NULL;

ALTER TABLE foodbanks
  DROP CONSTRAINT IF EXISTS foodbanks_referral_type_check;

ALTER TABLE foodbanks
  ADD CONSTRAINT foodbanks_referral_type_check
  CHECK (referral_type IN ('required', 'soft', 'none', 'unknown'));

CREATE INDEX IF NOT EXISTS foodbanks_geom_idx
  ON foodbanks
  USING GIST (geom);

CREATE INDEX IF NOT EXISTS foodbanks_postcode_idx
  ON foodbanks (postcode);

CREATE INDEX IF NOT EXISTS foodbanks_organisation_idx
  ON foodbanks (organisation);

CREATE INDEX IF NOT EXISTS foodbanks_referral_type_idx
  ON foodbanks (referral_type);

CREATE INDEX IF NOT EXISTS foodbanks_search_tsv_idx
  ON foodbanks
  USING GIN (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(organisation, '') || ' ' || coalesce(address, '')
    )
  );

CREATE INDEX IF NOT EXISTS foodbanks_opening_hours_parsed_idx
  ON foodbanks
  USING GIN (opening_hours_parsed);

CREATE INDEX IF NOT EXISTS foodbanks_services_idx
  ON foodbanks
  USING GIN (services);

CREATE INDEX IF NOT EXISTS foodbanks_inventory_tags_idx
  ON foodbanks
  USING GIN (inventory_tags);

CREATE INDEX IF NOT EXISTS foodbanks_ai_last_updated_idx
  ON foodbanks (ai_last_updated);

CREATE UNIQUE INDEX IF NOT EXISTS foodbanks_name_postcode_unique_idx
  ON foodbanks ((LOWER(coalesce(name, ''))), (UPPER(coalesce(postcode, ''))));

CREATE TABLE IF NOT EXISTS coverage_cells (
  id SERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom GEOGRAPHY(Point, 4326) NOT NULL,
  distance_to_foodbank DOUBLE PRECISION NOT NULL,
  coverage_score DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (lat >= 49 AND lat <= 61),
  CHECK (lng >= -9 AND lng <= 3),
  CHECK (distance_to_foodbank >= 0),
  CHECK (coverage_score >= 0 AND coverage_score <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS coverage_cells_lat_lng_unique_idx
  ON coverage_cells (lat, lng);

CREATE INDEX IF NOT EXISTS coverage_cells_geom_idx
  ON coverage_cells
  USING GIST (geom);

CREATE INDEX IF NOT EXISTS coverage_cells_score_idx
  ON coverage_cells (coverage_score);

CREATE TABLE IF NOT EXISTS enrichment_queue (
  id SERIAL PRIMARY KEY,
  foodbank_id INTEGER NOT NULL REFERENCES foodbanks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (foodbank_id),
  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS enrichment_queue_status_idx
  ON enrichment_queue (status, attempts, last_attempt);

CREATE OR REPLACE FUNCTION set_foodbanks_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS foodbanks_updated_at_trigger ON foodbanks;
CREATE TRIGGER foodbanks_updated_at_trigger
BEFORE UPDATE ON foodbanks
FOR EACH ROW
EXECUTE FUNCTION set_foodbanks_updated_at_timestamp();

DROP TRIGGER IF EXISTS coverage_cells_updated_at_trigger ON coverage_cells;
CREATE TRIGGER coverage_cells_updated_at_trigger
BEFORE UPDATE ON coverage_cells
FOR EACH ROW
EXECUTE FUNCTION set_foodbanks_updated_at_timestamp();

DROP TRIGGER IF EXISTS enrichment_queue_updated_at_trigger ON enrichment_queue;
CREATE TRIGGER enrichment_queue_updated_at_trigger
BEFORE UPDATE ON enrichment_queue
FOR EACH ROW
EXECUTE FUNCTION set_foodbanks_updated_at_timestamp();
