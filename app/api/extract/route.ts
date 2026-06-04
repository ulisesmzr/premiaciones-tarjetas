import { NextRequest, NextResponse } from "next/server";
import { TEMPLATES, keyField, norm } from "@/lib/templates";

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

DETECCIÓN OBLIGATORIA: Antes de extraer, cuenta cuántas tarjetas ${tpl.name} hay en la imagen. Si hay 3, el arreglo debe tener 3 elementos. Revisa toda la imagen de borde a borde.

EXTRAE estos campos de CADA tarjeta:

${fieldList}

═══ REGLAS CRÍTICAS ═══

1. DÍGITOS vs LETRAS (campos numéricos):
   - NUNCA uses "O" — siempre es el dígito "0"
   - NUNCA uses "I" ni "l" — siempre es el dígito "1"
   - NUNCA uses "B" en numéricos — podría ser "8"
   - NUNCA uses "S" en numéricos — podría ser "5"

2. CONTEO DE DÍGITOS:
   - Lee cada dígito individualmente de izquierda a derecha
   - Cuenta ANTES de reportar
   - NUNCA dupliques un dígito ("7017" son 4 dígitos, no "70017")
   - Si la longitud no coincide con el rango esperado, revisa de nuevo

3. CONFIANZA BAJA si:
   - Un dígito es ambiguo
   - La longitud no coincide
   - Imagen borrosa o con brillo

4. MÚLTIPLES TARJETAS:
   - Devuelve UNA entrada por CADA tarjeta visible
   - No mezcles datos de tarjetas distintas
   - Si hay 5 tarjetas, el arreglo tiene 5 elementos

Devuelve SOLO JSON válido, sin markdown:
{ "tarjetas": [ { "campos": { ${jsonShape} }, "confianza": { ${confShape} } } ] }`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
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
    const out: any[] = [];

    for (const item of list) {
      const campos = item.campos || {};
      const conf: Record<string, string> = { ...item.confianza };
      const kv = norm(campos[kf.id], kf.numeric);

      for (const f of fields) {
        if (f.numeric && (f.minLen || f.maxLen)) {
          const v = norm(campos[f.id], true);
          if (v && ((f.minLen && v.length < f.minLen) || (f.maxLen && v.length > f.maxLen))) {
            conf[f.id] = "baja";
          }
        }
      }
      out.push({ campos, confianza: conf, key_value: kv, dupInDb: false });
    }
    return NextResponse.json({ tarjetas: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
