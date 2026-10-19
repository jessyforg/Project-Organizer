import type { Migration } from '../migrator';

/** Migrations for each profile.db. Never edit an applied migration; add a new one. */
export const profileMigrations: readonly Migration[] = [
  {
    version: 1,
    name: 'settings',
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'core_domain',
    sql: `
      CREATE TABLE folders (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_key TEXT NOT NULL UNIQUE,
        sort_key INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        folder_id TEXT REFERENCES folders (id) ON DELETE SET NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT,
        kind TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('general', 'software')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
        is_inbox INTEGER NOT NULL DEFAULT 0 CHECK (is_inbox IN (0, 1)),
        color TEXT,
        start_date TEXT CHECK (start_date IS NULL OR start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        target_date TEXT CHECK (target_date IS NULL OR target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        deletion_batch_id TEXT,
        CHECK (start_date IS NULL OR target_date IS NULL OR start_date <= target_date),
        CHECK ((deleted_at IS NULL) = (deletion_batch_id IS NULL)),
        CHECK (is_inbox = 0 OR (status = 'active' AND archived_at IS NULL AND deleted_at IS NULL))
      ) STRICT;
      CREATE UNIQUE INDEX projects_one_inbox ON projects (is_inbox) WHERE is_inbox = 1;
      CREATE INDEX projects_folder ON projects (folder_id);
      CREATE INDEX projects_live ON projects (deleted_at, archived_at);
      CREATE INDEX projects_batch ON projects (deletion_batch_id) WHERE deletion_batch_id IS NOT NULL;

      CREATE TABLE project_statuses (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_key TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('todo', 'in_progress', 'done', 'cancelled')),
        sort_key INTEGER NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (is_default = 0 OR category IN ('todo', 'in_progress'))
      ) STRICT;
      CREATE UNIQUE INDEX project_statuses_name ON project_statuses (project_id, name_key);
      CREATE UNIQUE INDEX project_statuses_one_default ON project_statuses (project_id) WHERE is_default = 1;

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        parent_task_id TEXT REFERENCES tasks (id) ON DELETE CASCADE,
        status_id TEXT NOT NULL REFERENCES project_statuses (id),
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        description TEXT,
        priority TEXT CHECK (priority IS NULL OR priority IN ('urgent', 'high', 'medium', 'low')),
        start_date TEXT CHECK (start_date IS NULL OR start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        due_date TEXT CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        sort_key INTEGER NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        deletion_batch_id TEXT,
        CHECK (parent_task_id IS NULL OR parent_task_id <> id),
        CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date),
        CHECK ((deleted_at IS NULL) = (deletion_batch_id IS NULL))
      ) STRICT;
      CREATE INDEX tasks_project ON tasks (project_id, deleted_at);
      CREATE INDEX tasks_parent ON tasks (parent_task_id);
      CREATE INDEX tasks_status ON tasks (status_id);
      CREATE INDEX tasks_due ON tasks (due_date) WHERE deleted_at IS NULL;
      CREATE INDEX tasks_updated ON tasks (updated_at);
      CREATE INDEX tasks_batch ON tasks (deletion_batch_id) WHERE deletion_batch_id IS NOT NULL;

      -- Guards that hold even if application code is wrong.
      CREATE TRIGGER tasks_guard_insert BEFORE INSERT ON tasks
      BEGIN
        SELECT RAISE(ABORT, 'task status must belong to the task project')
        WHERE (SELECT project_id FROM project_statuses WHERE id = NEW.status_id) IS NOT NEW.project_id;
        SELECT RAISE(ABORT, 'subtask parent must be a top-level task in the same project')
        WHERE NEW.parent_task_id IS NOT NULL AND (
          (SELECT project_id FROM tasks WHERE id = NEW.parent_task_id) IS NOT NEW.project_id
          OR (SELECT parent_task_id FROM tasks WHERE id = NEW.parent_task_id) IS NOT NULL);
      END;
      CREATE TRIGGER tasks_guard_update BEFORE UPDATE OF project_id, parent_task_id, status_id ON tasks
      BEGIN
        SELECT RAISE(ABORT, 'task status must belong to the task project')
        WHERE (SELECT project_id FROM project_statuses WHERE id = NEW.status_id) IS NOT NEW.project_id;
        SELECT RAISE(ABORT, 'subtask parent must be a top-level task in the same project')
        WHERE NEW.parent_task_id IS NOT NULL AND (
          (SELECT project_id FROM tasks WHERE id = NEW.parent_task_id) IS NOT NEW.project_id
          OR (SELECT parent_task_id FROM tasks WHERE id = NEW.parent_task_id) IS NOT NULL
          OR EXISTS (SELECT 1 FROM tasks WHERE parent_task_id = NEW.id));
      END;

      CREATE TABLE tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_key TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE task_tags (
        task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
      ) STRICT;
      CREATE INDEX task_tags_tag ON task_tags (tag_id);

      CREATE TABLE project_tags (
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, tag_id)
      ) STRICT;
      CREATE INDEX project_tags_tag ON project_tags (tag_id);

      CREATE TABLE task_dependencies (
        task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        depends_on_task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, depends_on_task_id),
        CHECK (task_id <> depends_on_task_id)
      ) STRICT;
      CREATE INDEX task_dependencies_prerequisite ON task_dependencies (depends_on_task_id);
      CREATE TRIGGER task_dependencies_same_project BEFORE INSERT ON task_dependencies
      BEGIN
        SELECT RAISE(ABORT, 'dependencies must link tasks in the same project')
        WHERE (SELECT project_id FROM tasks WHERE id = NEW.task_id)
          IS NOT (SELECT project_id FROM tasks WHERE id = NEW.depends_on_task_id);
      END;

      -- Full-text search. Each index keeps its own copy keyed by ID (not rowid),
      -- so it stays correct even if SQLite ever renumbers rowids.
      CREATE VIRTUAL TABLE tasks_fts USING fts5 (
        task_id UNINDEXED, title, description, tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
        INSERT INTO tasks_fts (task_id, title, description)
        VALUES (NEW.id, NEW.title, coalesce(NEW.description, ''));
      END;
      CREATE TRIGGER tasks_fts_update AFTER UPDATE OF title, description ON tasks BEGIN
        DELETE FROM tasks_fts WHERE task_id = OLD.id;
        INSERT INTO tasks_fts (task_id, title, description)
        VALUES (NEW.id, NEW.title, coalesce(NEW.description, ''));
      END;
      CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks BEGIN
        DELETE FROM tasks_fts WHERE task_id = OLD.id;
      END;

      CREATE VIRTUAL TABLE projects_fts USING fts5 (
        project_id UNINDEXED, name, description, tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER projects_fts_insert AFTER INSERT ON projects BEGIN
        INSERT INTO projects_fts (project_id, name, description)
        VALUES (NEW.id, NEW.name, coalesce(NEW.description, ''));
      END;
      CREATE TRIGGER projects_fts_update AFTER UPDATE OF name, description ON projects BEGIN
        DELETE FROM projects_fts WHERE project_id = OLD.id;
        INSERT INTO projects_fts (project_id, name, description)
        VALUES (NEW.id, NEW.name, coalesce(NEW.description, ''));
      END;
      CREATE TRIGGER projects_fts_delete AFTER DELETE ON projects BEGIN
        DELETE FROM projects_fts WHERE project_id = OLD.id;
      END;
    `,
  },
  {
    version: 3,
    name: 'notes',
    sql: `
      CREATE TABLE notes (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        deletion_batch_id TEXT,
        CHECK ((deleted_at IS NULL) = (deletion_batch_id IS NULL))
      ) STRICT;
      CREATE INDEX notes_project ON notes (project_id, deleted_at);
      CREATE INDEX notes_updated ON notes (updated_at);
      CREATE INDEX notes_batch ON notes (deletion_batch_id) WHERE deletion_batch_id IS NOT NULL;

      CREATE TABLE note_tags (
        note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, tag_id)
      ) STRICT;
      CREATE INDEX note_tags_tag ON note_tags (tag_id);

      CREATE VIRTUAL TABLE notes_fts USING fts5 (
        note_id UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts (note_id, title, body) VALUES (NEW.id, NEW.title, NEW.body);
      END;
      CREATE TRIGGER notes_fts_update AFTER UPDATE OF title, body ON notes BEGIN
        DELETE FROM notes_fts WHERE note_id = OLD.id;
        INSERT INTO notes_fts (note_id, title, body) VALUES (NEW.id, NEW.title, NEW.body);
      END;
      CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
        DELETE FROM notes_fts WHERE note_id = OLD.id;
      END;
    `,
  },
];
