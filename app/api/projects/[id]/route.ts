import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  await ensureSchema(db);
  const project = await db.prepare("SELECT id, name, target, created_at FROM projects WHERE id = ?").bind(id).first();
  if (!project) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const { results } = await db.prepare(
    "SELECT id, brand, key_value, data, monto, created_at FROM cards WHERE project_id = ? ORDER BY created_at ASC"
  ).bind(id).all();
  const cards = (results || []).map((r: any) => ({
    id: r.id, brand: r.brand, key_value: r.key_value, monto: r.monto,
    data: JSON.parse(r.data || "{}"), created_at: r.created_at,
  }));
  return NextResponse.json({ project, cards });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  await ensureSchema(db);
  await db.prepare("DELETE FROM cards WHERE project_id = ?").bind(id).run();
  await db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
  return NextResponse.json({ ok: true });
}
