CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
  place_id TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  address TEXT NOT NULL,
  glove_type TEXT NOT NULL CHECK (glove_type IN ('vinyl', 'nitrile', 'latex', 'none')),
  notes TEXT DEFAULT '',
  submitted_by TEXT DEFAULT 'anonymous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_place_id ON submissions(place_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
