CREATE TABLE IF NOT EXISTS app_user_role (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'responsible', 'dp', 'member')),
  PRIMARY KEY (user_id, role)
);

-- Preserve the existing authorization model: users already designated as a
-- diving director keep access to the safety-sheet API after the migration.
INSERT INTO app_user_role (user_id, role)
SELECT DISTINCT director_id, 'dp'
FROM outing
ON CONFLICT (user_id, role) DO NOTHING;
