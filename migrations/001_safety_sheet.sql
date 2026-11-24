CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS app_session (
  token_digest text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS member (
  id uuid PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  held_level text,
  qualifications text[] NOT NULL DEFAULT '{}',
  last_caci date
);

CREATE TABLE IF NOT EXISTS outing (
  id uuid PRIMARY KEY,
  director_id uuid NOT NULL REFERENCES app_user(id),
  status text NOT NULL CHECK (status IN ('draft','published','closed','preparing','in_progress','completed','archived','cancelled')),
  starts_on date NOT NULL,
  reserved_device_id uuid
);

CREATE TABLE IF NOT EXISTS outing_registration (
  id uuid PRIMARY KEY,
  outing_id uuid NOT NULL REFERENCES outing(id),
  member_id uuid NOT NULL REFERENCES member(id),
  status text NOT NULL CHECK (status IN ('confirmed','waitlisted','cancelled')),
  UNIQUE (outing_id, member_id),
  UNIQUE (outing_id, id, member_id)
);

CREATE TABLE IF NOT EXISTS safety_sheet (
  outing_id uuid PRIMARY KEY REFERENCES outing(id),
  revision integer NOT NULL CHECK (revision > 0)
);

CREATE TABLE IF NOT EXISTS safety_participant (
  id uuid PRIMARY KEY,
  outing_id uuid NOT NULL REFERENCES safety_sheet(outing_id),
  member_id uuid REFERENCES member(id),
  registration_id uuid,
  origin text NOT NULL CHECK (origin IN ('guest','member','registration')),
  present boolean,
  removed boolean NOT NULL,
  UNIQUE (outing_id, member_id),
  FOREIGN KEY (outing_id, registration_id, member_id)
    REFERENCES outing_registration(outing_id, id, member_id),
  CHECK ((origin = 'guest') = (member_id IS NULL)),
  CHECK (origin <> 'registration' OR registration_id IS NOT NULL),
  CHECK (member_id IS NOT NULL OR registration_id IS NULL)
);

CREATE TABLE IF NOT EXISTS safety_snapshot (
  participant_id uuid NOT NULL REFERENCES safety_participant(id),
  number integer NOT NULL CHECK (number > 0),
  contents jsonb NOT NULL,
  PRIMARY KEY (participant_id, number)
);

CREATE TABLE IF NOT EXISTS safety_mutation (
  outing_id uuid NOT NULL REFERENCES safety_sheet(outing_id),
  revision integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES app_user(id),
  occurred_at timestamptz NOT NULL,
  action text NOT NULL,
  field text,
  participant_ids uuid[] NOT NULL,
  idempotency_key uuid NOT NULL,
  command_digest text NOT NULL,
  PRIMARY KEY (outing_id, revision),
  UNIQUE (outing_id, actor_id, idempotency_key)
);
