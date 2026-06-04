import { NextRequest, NextResponse } from "next/server";
import { TEMPLATES, keyField, norm } from "@/lib/templates";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType, brand } = await req.json();
    const tpl = TEMPLATES[brand];
    if (!imageBase64 || !tpl) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
    const model = process.env.MODEL || "claude-sonnet-4-6";
    const fields = tpl.fields;

    const fieldList = fields.map((f) => `- "${f.id}" → ${f.label}${f.hint ? " (" + f.hint + ")" : ""}`).join("\n");
    const jsonShape = fields.map((f) => `"${f.id}": "valor o null"`).join(", ");
    const confShape = fields.map((f) => `"${f.id}": "alta|media|baja"`).join(", ");

    const prompt = `Eres un extractor de datos de tarjetas de regalo mexicanas (marca: ${tpl.name}). La imagen puede contener UNA o VARIAS tarjetas. Extrae estos campos de CADA tarjeta visible:
${fieldList}

Reglas:
- Respeta mayúsculas, minúsculas, guiones y caracteres tal cual aparecen.
- NO inventes. Si un carácter es ilegible, borroso o ambiguo, baja la confianza de ese campo a "baja".
- En números, quita los espacios internos.
- En códigos alfanuméricos conserva los guiones.
- Si un campo no aparece, pon null y confianza "baja".

Devuelve SOLO un JSON válido, sin markdown ni texto adicional:
{ "tarjetas": [ { "campos": { ${jsonShape} }, "confianza": { ${confShape} } } ] }
Una entrada del arreglo por CADA tarjeta visible. Si solo hay una tarjeta, el arreglo tiene un elemento.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: prompt },
        ]}],
      }),
    });
    if (!r.ok) { const t = await r.text(); return NextResponse.json({ error: "API visión: " + t.slice(0, 200) }, { status: 502 }); }
    const data = await r.json();
    const text = (data.content || []).filter((i: any) => i.type === "text").map((i: any) => i.text).join("").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed.tarjetas) ? parsed.tarjetas : [];

    const kf = keyField(brand);
    const db = getDb();
    await ensureSchema(db);

    const out: any[] = [];
    for (const item of list) {
      const campos = item.campos || {};
      const conf = item.confianza || {};
      const kv = norm(campos[kf.id], kf.numeric);
      let dupInDb = false;
      if (kv) {
        const row = await db.prepare("SELECT id FROM cards WHERE key_value = ?").bind(kv).first();
        dupInDb = !!row;
      }
      out.push({ campos, confianza: conf, key_value: kv, dupInDb });
    }
    return NextResponse.json({ tarjetas: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
