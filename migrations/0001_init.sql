-- Working copy (the draft). One row per event, member, partner; one row (id 'blocks') for page text.
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('event','member','partner','block')),
  position INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX items_kind ON items(kind, position);

-- Uploaded images. key is the SHA-256 of the file plus its extension, so files never change.
CREATE TABLE media (
  key TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  filename TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  archived_at INTEGER
);

-- Every publish, scheduled publish and rollback. Append-only.
CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published','scheduled','superseded','cancelled')),
  publish_at INTEGER,
  base_release_id TEXT,
  rolled_back_from TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  published_at INTEGER
);
CREATE INDEX releases_status ON releases(status, publish_at);
CREATE INDEX releases_created ON releases(created_at);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_release_id TEXT,
  draft_rev INTEGER NOT NULL DEFAULT 0,
  preview_token TEXT NOT NULL
);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE INDEX audit_at ON audit(at);
