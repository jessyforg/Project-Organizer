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
  {
    // Note folders (ADR-0014). Deleting a folder keeps its notes, outside any folder.
    version: 4,
    name: 'note_folders',
    sql: `
      CREATE TABLE note_folders (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES note_folders (id) ON DELETE SET NULL;
      CREATE INDEX notes_folder ON notes (folder_id, deleted_at);
    `,
  },
  {
    // Archived notes (ADR-0015): hidden from lists, read-only until unarchived.
    version: 5,
    name: 'note_archiving',
    sql: `
      ALTER TABLE notes ADD COLUMN archived_at TEXT;
      CREATE INDEX notes_archived ON notes (archived_at) WHERE archived_at IS NOT NULL;
    `,
  },
  {
    // Links from notes to notes, tasks, and projects (ADR-0017). An index derived from each
    // note's Markdown, which stays the source of truth; targets may be missing (broken links).
    version: 6,
    name: 'note_links',
    sql: `
      CREATE TABLE note_links (
        source_note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        target_kind TEXT NOT NULL CHECK (target_kind IN ('note', 'task', 'project')),
        target_id TEXT NOT NULL,
        PRIMARY KEY (source_note_id, target_kind, target_id)
      ) STRICT;
      CREATE INDEX note_links_target ON note_links (target_kind, target_id);

      -- Images and other files in notes (ADR-0017 stage 6), kept in the database so a backup
      -- stays one encrypted file. A file outlives the note it was added to while any note
      -- refers to it; unused_since starts the clock for removing it.
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY NOT NULL,
        note_id TEXT REFERENCES notes (id) ON DELETE SET NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
        mime TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size >= 0),
        sha256 TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at TEXT NOT NULL,
        unused_since TEXT
      ) STRICT;
      CREATE INDEX attachments_note ON attachments (note_id);
    `,
  },
  {
    // Favourites, icons, and covers (ADR-0019). A favourite names exactly one item and goes
    // with it when the item is permanently deleted; while the item is in the trash it is
    // simply not listed. Icons and covers are checked against fixed lists by the service.
    version: 7,
    name: 'favourites_icons_covers',
    sql: `
      CREATE TABLE favourites (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
        note_id TEXT REFERENCES notes (id) ON DELETE CASCADE,
        sort_key INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        CHECK ((project_id IS NULL) <> (note_id IS NULL))
      ) STRICT;
      CREATE UNIQUE INDEX favourites_project ON favourites (project_id)
        WHERE project_id IS NOT NULL;
      CREATE UNIQUE INDEX favourites_note ON favourites (note_id) WHERE note_id IS NOT NULL;

      ALTER TABLE projects ADD COLUMN icon TEXT;
      ALTER TABLE projects ADD COLUMN cover TEXT;
      ALTER TABLE notes ADD COLUMN icon TEXT;
      ALTER TABLE notes ADD COLUMN cover TEXT;
    `,
  },
  {
    // Milestones (ADR-0020). A task's milestone belongs to the task's project, and only
    // top-level tasks have one (subtasks count through their parent). Trashing a milestone
    // keeps the links, so restoring it brings them back; deleting it for good clears them.
    version: 8,
    name: 'milestones',
    sql: `
      CREATE TABLE milestones (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT,
        target_date TEXT CHECK (target_date IS NULL OR target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        deletion_batch_id TEXT,
        CHECK ((deleted_at IS NULL) = (deletion_batch_id IS NULL))
      ) STRICT;
      CREATE INDEX milestones_project ON milestones (project_id, deleted_at);
      CREATE INDEX milestones_target ON milestones (target_date) WHERE deleted_at IS NULL;
      CREATE INDEX milestones_batch ON milestones (deletion_batch_id)
        WHERE deletion_batch_id IS NOT NULL;

      ALTER TABLE tasks ADD COLUMN milestone_id TEXT REFERENCES milestones (id) ON DELETE SET NULL;
      CREATE INDEX tasks_milestone ON tasks (milestone_id) WHERE milestone_id IS NOT NULL;

      CREATE TRIGGER tasks_milestone_insert BEFORE INSERT ON tasks
      WHEN NEW.milestone_id IS NOT NULL BEGIN
        SELECT RAISE(ABORT, 'a milestone must belong to the task''s project, and only top-level tasks have one')
        WHERE NEW.parent_task_id IS NOT NULL
           OR (SELECT project_id FROM milestones WHERE id = NEW.milestone_id) IS NOT NEW.project_id;
      END;
      CREATE TRIGGER tasks_milestone_update
      BEFORE UPDATE OF milestone_id, project_id, parent_task_id ON tasks
      WHEN NEW.milestone_id IS NOT NULL BEGIN
        SELECT RAISE(ABORT, 'a milestone must belong to the task''s project, and only top-level tasks have one')
        WHERE NEW.parent_task_id IS NOT NULL
           OR (SELECT project_id FROM milestones WHERE id = NEW.milestone_id) IS NOT NEW.project_id;
      END;

      -- Milestones can be starred (ADR-0019): the favourites table gains a third item column.
      -- SQLite cannot change a CHECK in place, so the table is rebuilt and its rows copied.
      CREATE TABLE favourites_v8 (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
        note_id TEXT REFERENCES notes (id) ON DELETE CASCADE,
        milestone_id TEXT REFERENCES milestones (id) ON DELETE CASCADE,
        sort_key INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        CHECK ((project_id IS NOT NULL) + (note_id IS NOT NULL) + (milestone_id IS NOT NULL) = 1)
      ) STRICT;
      INSERT INTO favourites_v8 (id, project_id, note_id, sort_key, created_at)
        SELECT id, project_id, note_id, sort_key, created_at FROM favourites;
      DROP TABLE favourites;
      ALTER TABLE favourites_v8 RENAME TO favourites;
      CREATE UNIQUE INDEX favourites_project ON favourites (project_id)
        WHERE project_id IS NOT NULL;
      CREATE UNIQUE INDEX favourites_note ON favourites (note_id) WHERE note_id IS NOT NULL;
      CREATE UNIQUE INDEX favourites_milestone ON favourites (milestone_id)
        WHERE milestone_id IS NOT NULL;
    `,
  },
  {
    // The activity log (ADR-0021). No foreign keys: events describe the past and outlive
    // renames and moves; permanent deletion removes an item's events explicitly.
    version: 9,
    name: 'activity_log',
    sql: `
      CREATE TABLE activity_events (
        id INTEGER PRIMARY KEY,
        at TEXT NOT NULL,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('task', 'project', 'note', 'milestone')),
        item_id TEXT NOT NULL,
        project_id TEXT,
        title TEXT NOT NULL,
        action TEXT NOT NULL,
        field TEXT,
        old_value TEXT,
        new_value TEXT
      ) STRICT;
      CREATE INDEX activity_item ON activity_events (item_kind, item_id, at);
      CREATE INDEX activity_project ON activity_events (project_id, at);
      CREATE INDEX activity_at ON activity_events (at);
    `,
  },
  {
    // Custom fields (ADR-0023). No value row means no value. A value's field belongs to the
    // task's project; trashing a field keeps its values, deleting it for good removes them.
    version: 10,
    name: 'custom_fields',
    sql: `
      CREATE TABLE custom_fields (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_key TEXT NOT NULL,
        type TEXT NOT NULL
          CHECK (type IN ('text', 'number', 'date', 'checkbox', 'select', 'multi_select')),
        options_json TEXT NOT NULL DEFAULT '[]',
        sort_key INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        deletion_batch_id TEXT,
        CHECK ((deleted_at IS NULL) = (deletion_batch_id IS NULL))
      ) STRICT;
      CREATE UNIQUE INDEX custom_fields_name ON custom_fields (project_id, name_key)
        WHERE deleted_at IS NULL;
      CREATE INDEX custom_fields_batch ON custom_fields (deletion_batch_id)
        WHERE deletion_batch_id IS NOT NULL;

      CREATE TABLE custom_values (
        task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        field_id TEXT NOT NULL REFERENCES custom_fields (id) ON DELETE CASCADE,
        value_json TEXT NOT NULL,
        PRIMARY KEY (task_id, field_id)
      ) STRICT;
      CREATE INDEX custom_values_field ON custom_values (field_id);

      CREATE TRIGGER custom_values_same_project BEFORE INSERT ON custom_values BEGIN
        SELECT RAISE(ABORT, 'a custom field belongs to another project')
        WHERE (SELECT project_id FROM custom_fields WHERE id = NEW.field_id)
          IS NOT (SELECT project_id FROM tasks WHERE id = NEW.task_id);
      END;
      -- Fields belong to a project, so a task moving away leaves its values behind.
      CREATE TRIGGER tasks_move_drops_custom_values AFTER UPDATE OF project_id ON tasks
      WHEN NEW.project_id IS NOT OLD.project_id BEGIN
        DELETE FROM custom_values WHERE task_id = NEW.id;
      END;
    `,
  },
  {
    // Project templates saved or imported by the user (ADR-0024); built-in ones live in code.
    // The content is versioned JSON, checked against a schema whenever it is read or written.
    version: 11,
    name: 'templates',
    sql: `
      CREATE TABLE templates (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_key TEXT NOT NULL UNIQUE,
        description TEXT,
        content_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
];
