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

    // Construir lista de campos con ubicación espacial
    const fieldList = fields.map((f) => {
      const parts = [`- "${f.id}" → ${f.label}`];
      if (f.layout) parts.push(`  Dónde está: ${f.layout}`);
      if (f.hint) parts.push(`  Formato: ${f.hint}`);
      if (f.numeric) parts.push(`  TIPO: SOLO dígitos 0-9, NUNCA letras`);
      if (f.minLen && f.maxLen && f.minLen === f.maxLen) parts.push(`  Exactamente ${f.minLen} caracteres`);
      else if (f.minLen && f.maxLen) parts.push(`  Entre ${f.minLen} y ${f.maxLen} caracteres`);
      return parts.join("\n");
    }).join("\n\n");

    const jsonShape = fields.map((f) => `"${f.id}": "valor o null"`).join(", ");
    const confShape = fields.map((f) => `"${f.id}": "alta|media|baja"`).join(", ");

    const prompt = `Eres un experto extractor de datos de tarjetas de regalo mexicanas (marca: ${tpl.name}) con MÁXIMA precisión. La imagen puede contener UNA o VARIAS tarjetas.

EXTRAE estos campos de CADA tarjeta visible:

${fieldList}

═══ REGLAS CRÍTICAS DE PRECISIÓN ═══

1. DÍGITOS vs LETRAS (campo numérico):
   - NUNCA uses la letra "O" en campos numéricos — siempre es el DÍGITO CERO "0"
   - NUNCA uses "I" o "l" en campos numéricos — siempre es el DÍGITO UNO "1"
   - NUNCA uses "B" en campos numéricos — podría ser "8"
   - NUNCA uses "S" en campos numéricos — podría ser "5"
   - En campos numéricos, cualquier símbolo redondo = "0", cualquier símbolo vertical = "1"

2. CONTEO DE DÍGITOS:
   - Lee cada dígito individualmente de izquierda a derecha
   - Cuenta los dígitos ANTES de reportar
   - Si la longitud no coincide con el rango esperado, revisa la imagen de nuevo
   - NUNCA dupliques un dígito — si ves "7017", son 4 dígitos, no "70017"

3. UBICACIÓN ESPACIAL:
   - Lee EXACTAMENTE el campo indicado en su ubicación
   - No confundas el número de tarjeta con el número de serie
   - No confundas el CVV/monto holográfico con el número vertical lateral
   - El código de barras numérico NO es el código de canje

4. CONFIANZA BAJA si:
   - Un dígito es ambiguo (podría ser dos caracteres distintos)
   - La longitud no coincide con la esperada
   - La imagen está borrosa, con brillo o el área está tapada
   - Hay más o menos dígitos de los esperados

5. MÚLTIPLES TARJETAS:
   - Si hay más de una tarjeta, devuelve una entrada por cada una
   - No mezcles datos de tarjetas distintas

Devuelve SOLO JSON válido, sin markdown:
{ "tarjetas": [ { "campos": { ${jsonShape} }, "confianza": { ${confShape} } } ] }`;

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

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: "API visión: " + t.slice(0, 200) }, { status: 502 });
    }
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
      const conf: Record<string, string> = item.confianza || {};

      // Validación de longitud para campos numéricos
      for (const f of fields) {
        if (f.numeric && (f.minLen || f.maxLen)) {
          const v = norm(campos[f.id], true);
          const tooShort = f.minLen && v.length < f.minLen;
          const tooLong = f.maxLen && v.length > f.maxLen;
          if (tooShort || tooLong) {
            conf[f.id] = "baja"; // fuerza revisión si longitud incorrecta
          }
        }
      }

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
