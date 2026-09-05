import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type GameActivityAction =
  | "server_start"
  | "server_stop"
  | "console_command"
  | "plugin_upload"
  | "file_update";

export class AppDatabase {
  private readonly database: DatabaseSync;
  readonly path: string;

  constructor(databasePath: string) {
    this.path = path.resolve(databasePath);
    mkdirSync(path.dirname(this.path), { recursive: true });
    this.database = new DatabaseSync(this.path, {
      timeout: 5_000,
      allowExtension: false,
    });
    this.migrate();
  }

  recordGameActivity(action: GameActivityAction, details: Record<string, unknown> = {}) {
    this.database.prepare(`
      INSERT INTO game_activity (server_id, action, details_json)
      VALUES (?, ?, ?)
    `).run("minecraft", action, JSON.stringify(details));
  }

  getStatus() {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM game_activity").get() as { count: number };
    return {
      ready: true,
      engine: "sqlite",
      activityEntries: Number(row.count),
    };
  }

  private migrate() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      CREATE TABLE IF NOT EXISTS game_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        game_type TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      CREATE TABLE IF NOT EXISTS game_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL REFERENCES game_servers(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      CREATE INDEX IF NOT EXISTS game_activity_server_created
      ON game_activity(server_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
      INSERT OR IGNORE INTO game_servers (id, name, game_type)
      VALUES ('minecraft', 'KarpikNAS Minecraft', 'minecraft-java');
    `);
  }
}
