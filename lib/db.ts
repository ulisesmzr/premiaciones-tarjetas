import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDb(): any {
  const { env } = getCloudflareContext();
  return (env as any).DB;
}

let schemaReady = false;
export async function ensureSchema(db: any) {
  if (schemaReady) return;
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, target INTEGER DEFAULT 0, created_at INTEGER NOT NULL)"
  ).run();
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, brand TEXT NOT NULL, key_value TEXT NOT NULL, data TEXT NOT NULL, monto TEXT, created_at INTEGER NOT NULL)"
  ).run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_key ON cards(key_value)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_cards_project ON cards(project_id)").run();
  schemaReady = true;
}

export function uid(): string {
  const c: any = (globalThis as any).crypto;
  if (c && c.randomUUID) return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
