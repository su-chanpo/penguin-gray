CREATE TABLE administrators (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX administrators_active ON administrators (is_active, email);
