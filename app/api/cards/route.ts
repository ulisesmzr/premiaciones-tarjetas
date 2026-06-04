import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema, uid } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { projectId, brand, monto, cards } = await req.json();
  if (!projectId || !brand || !Array.isArray(cards)) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  const db = getDb();
  await ensureSchema(db);
  let saved = 0, skipped = 0;
  for (const c of cards) {
    const kv = c.key_value;
    if (!kv) { skipped++; continue; }
    try {
      await db.prepare(
        "INSERT INTO cards (id, project_id, brand, key_value, data, monto, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(uid(), projectId, brand, kv, JSON.stringify(c.data || {}), monto != null ? String(monto) : null, Date.now()).run();
      saved++;
    } catch (e) {
      skipped++; // UNIQUE => duplicado global
    }
  }
  return NextResponse.json({ saved, skipped });
}
