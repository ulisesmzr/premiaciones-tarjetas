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
      if (f.layout) parts.push(`  Ubicación: ${f.layout}`);
      if (f.hint) parts.push(`  Formato esperado: ${f.hint}`);
      if (f.numeric) parts.push(`  ⚠ NUMÉRICO: escribe SOLO dígitos 0-9, jamás letras`);
      if (f.minLen && f.maxLen && f.minLen === f.maxLen) parts.push(`  ⚠ Longitud exacta: ${f.minLen} dígitos — si tienes más, hay un dígito duplicado`);
      else if (f.minLen && f.maxLen) parts.push(`  ⚠ Longitud: entre ${f.minLen} y ${f.maxLen} dígitos`);
      return parts.join("\n");
    }).join("\n\n");

    const jsonShape = fields.map((f) => `"${f.id}": "valor o null"`).join(", ");
    const confShape = fields.map((f) => `"${f.id}": "alta|media|baja"`).join(", ");

    const prompt = `Eres un experto extractor de datos de tarjetas de regalo mexicanas. Marca a procesar: ${tpl.name}.

═══ PASO 1: CUENTA TODAS LAS TARJETAS ═══
Examina la imagen COMPLETA de esquina a esquina.
Identifica cada tarjeta ${tpl.name} visible (en fila, en grid, traslapadas, etc.).
Asígnales un número: tarjeta 1, tarjeta 2, tarjeta 3...
El arreglo de salida DEBE tener exactamente ese número de elementos.
⚠ Si hay 5 tarjetas y devuelves 1, eso es un ERROR GRAVE. Devuelve TODAS.
Si una tarjeta está parcialmente visible o borrosa, inclúyela con confianza "baja".

═══ PASO 2: EXTRAE LOS CAMPOS DE CADA TARJETA ═══

${fieldList}

═══ PASO 3: REGLAS DE PRECISIÓN ═══

PARA CAMPOS NUMÉRICOS:
- La letra O y el dígito 0 se parecen — en campos numéricos SIEMPRE es el dígito "0"
- La letra I, la l minúscula y el 1 se parecen — en campos numéricos SIEMPRE es "1"
- Lee dígito por dígito de izquierda a derecha
- Cuenta los dígitos antes de reportar — si hay más de los esperados, relée: hay un dígito duplicado
- "7017" son 4 dígitos, nunca los escribas como "70017"

PARA CAMPOS ALFANUMÉRICOS (códigos Spotify, Amazon, Uber, etc.):
- Lee exactamente lo que está impreso en el código
- Si un carácter es genuinamente ambiguo entre O y 0, reporta confianza "baja"

CONFIANZA "baja" si:
- El dígito/letra es ambiguo
- La longitud no cuadra con lo esperado
- Imagen borrosa, con brillo, o el área está tapada

═══ PASO 4: VERIFICA ANTES DE RESPONDER ═══
¿El número de entradas en el arreglo coincide con el número de tarjetas que viste?
Para campos numéricos: ¿cada valor tiene SOLO dígitos? ¿La longitud es correcta?

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
