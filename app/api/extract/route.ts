import { NextRequest, NextResponse } from "next/server";
import type { Field } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType, fields } = (await req.json()) as {
      imageBase64: string;
      mediaType: string;
      fields: Field[];
    };
    if (!imageBase64 || !fields?.length) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
    const model = process.env.MODEL || "claude-sonnet-4-6";

    const fieldList = fields
      .map((f) => `- "${f.id}" → ${f.label}${f.hint ? " (" + f.hint + ")" : ""}`)
      .join("\n");
    const jsonShape = fields.map((f) => `"${f.id}": "valor o null"`).join(", ");
    const confShape = fields.map((f) => `"${f.id}": "alta|media|baja"`).join(", ");

    const prompt = `Eres un extractor de datos de tarjetas de regalo mexicanas. Lee la imagen y extrae EXACTAMENTE estos campos:
${fieldList}

Reglas estrictas:
- Respeta mayúsculas, minúsculas, guiones y caracteres tal cual aparecen.
- NO inventes dígitos ni caracteres. Si un carácter es ilegible, borroso o ambiguo, baja la confianza de ese campo a "baja".
- En números, quita los espacios internos (ej. "8 1200 2933 4190" => "8120029334190").
- En códigos alfanuméricos conserva los guiones (ej. "WABU-VHRRFC-DAVA2").
- El monto es solo el número (ej. "250"), sin "MXN" ni "$".
- Si un campo no aparece, pon null y confianza "baja".

Devuelve SOLO un objeto JSON válido, sin markdown ni texto adicional:
{ "campos": { ${jsonShape} }, "confianza": { ${confShape} } }`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: "API visión: " + t.slice(0, 200) }, { status: 502 });
    }
    const data = await r.json();
    const text = (data.content || [])
      .filter((i: any) => i.type === "text")
      .map((i: any) => i.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text);
    return NextResponse.json({ campos: parsed.campos || {}, confianza: parsed.confianza || {} });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
