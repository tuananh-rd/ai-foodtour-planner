CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE cities (
 id text PRIMARY KEY, name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'
);
CREATE TABLE venues (
 id text PRIMARY KEY, city_id text NOT NULL REFERENCES cities(id),
 name text NOT NULL, address_raw text NOT NULL, district_raw text,
 location geography(Point,4326), venue_types text[] NOT NULL,
 dish_groups text[] NOT NULL, cuisine_styles text[],
 price_min_vnd integer CHECK (price_min_vnd>=0), price_max_vnd integer,
 price_semantics text NOT NULL, hours_status text NOT NULL,
 hours_raw jsonb NOT NULL, source_url text NOT NULL UNIQUE,
 fetched_at timestamptz NOT NULL, verified_at timestamptz,
 license_status text NOT NULL DEFAULT 'unreviewed',
 CHECK (price_max_vnd>=price_min_vnd)
);
CREATE INDEX venues_location_gix ON venues USING gist(location);
CREATE TABLE field_evidence (
 venue_id text REFERENCES venues(id), field_name text NOT NULL,
 source_url text NOT NULL, observed_at timestamptz NOT NULL,
 raw_value jsonb NOT NULL, verification_status text NOT NULL,
 PRIMARY KEY(venue_id,field_name,source_url,observed_at)
);
