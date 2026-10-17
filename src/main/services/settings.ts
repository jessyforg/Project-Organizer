import { z } from 'zod';
import { THEMES, type ProfileSettings } from '@shared/domain';
import { nowIso, type ServiceContext } from './context';

/** Each setting has a schema and a default; invalid or unknown stored values fall back to defaults. */
const SETTINGS = {
  theme: { schema: z.enum(THEMES), fallback: 'system' },
} as const satisfies Record<keyof ProfileSettings, { schema: z.ZodType; fallback: unknown }>;

type Key = keyof ProfileSettings;

export class SettingsService {
  constructor(private readonly ctx: ServiceContext) {}

  get(): ProfileSettings {
    const rows = this.ctx.db.prepare('SELECT key, value_json FROM settings').all() as {
      key: string;
      value_json: string;
    }[];
    const stored = new Map(rows.map((r) => [r.key, r.value_json]));
    const read = <K extends Key>(key: K): ProfileSettings[K] => {
      const raw = stored.get(key);
      if (raw === undefined) return SETTINGS[key].fallback;
      try {
        const parsed = SETTINGS[key].schema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : SETTINGS[key].fallback;
      } catch {
        return SETTINGS[key].fallback;
      }
    };
    return { theme: read('theme') };
  }

  update(patch: {
    [K in keyof ProfileSettings]?: ProfileSettings[K] | undefined;
  }): ProfileSettings {
    const upsert = this.ctx.db.prepare(
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    );
    const now = nowIso(this.ctx);
    this.ctx.db.transaction(() => {
      for (const key of Object.keys(patch) as Key[]) {
        const value = patch[key];
        if (value === undefined) continue;
        upsert.run(key, JSON.stringify(SETTINGS[key].schema.parse(value)), now);
      }
    })();
    return this.get();
  }
}
