import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema, uid } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  await ensureSchema(db);
  const { results } = await db.prepare(
    "SELECT p.id, p.name, p.target, p.created_at, (SELECT COUNT(*) FROM cards c WHERE c.project_id = p.id) AS captured FROM projects p ORDER BY p.created_at DESC"
  ).all();
  return NextResponse.json({ projects: results || [] });
}

export async function POST(req: NextRequest) {
  const { name, target } = await req.json();
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const db = getDb();
  await ensureSchema(db);
  const id = uid();
  await db.prepare("INSERT INTO projects (id, name, target, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, String(name), Number(target) || 0, Date.now()).run();
  return NextResponse.json({ id });
}
