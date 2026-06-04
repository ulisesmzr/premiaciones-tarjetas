export type Field = { id: string; label: string; hint?: string; numeric?: boolean; key?: boolean };
export type Template = { name: string; fields: Field[] };

export const TEMPLATES: Record<string, Template> = {
  liverpool: {
    name: "Liverpool",
    fields: [
      { id: "tarjeta", label: "Número de tarjeta", key: true, hint: "13 a 15 dígitos", numeric: true },
      { id: "serie", label: "Número de serie", hint: "los primeros 4 dígitos (ej. 2505)", numeric: true },
      { id: "cvv", label: "CVV", hint: "los 3 dígitos de abajo", numeric: true },
    ],
  },
  amazon: {
    name: "Amazon",
    fields: [{ id: "codigo", label: "Código de canje", key: true, hint: "ej. WABU-VHRRFC-DAVA2" }],
  },
  uber: {
    name: "Uber / Uber Eats",
    fields: [{ id: "codigo", label: "Código de regalo", key: true, hint: "ej. LJVR6382049" }],
  },
  codigo: {
    name: "Código único (Spotify, Netflix…)",
    fields: [{ id: "codigo", label: "Código", key: true }],
  },
  tarjeta_serie: {
    name: "Tarjeta + Serie (sin CVV)",
    fields: [
      { id: "tarjeta", label: "Número de tarjeta", key: true, numeric: true },
      { id: "serie", label: "Número de serie", numeric: true },
    ],
  },
};

export function keyField(brand: string): Field {
  const t = TEMPLATES[brand];
  return t.fields.find((f) => f.key) || t.fields[0];
}

export function norm(v: any, numeric?: boolean): string {
  if (v == null) return "";
  let s = String(v).trim().toUpperCase().replace(/\s+/g, "");
  if (numeric) s = s.replace(/[^0-9]/g, "");
  return s;
}
