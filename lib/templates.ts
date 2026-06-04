export type Field = {
  id: string;
  label: string;
  hint?: string;
  layout?: string;
  numeric?: boolean;
  key?: boolean;
  minLen?: number;
  maxLen?: number;
};
export type Template = { name: string; fields: Field[] };

export const TEMPLATES: Record<string, Template> = {
  liverpool: {
    name: "Liverpool",
    fields: [
      {
        id: "tarjeta",
        label: "Número de tarjeta",
        key: true,
        numeric: true,
        hint: "13 a 15 dígitos SOLO números",
        layout: "número grande bajo la banda magnética negra, formato '8 0300 0879 7017' — lee dígito por dígito de izquierda a derecha, cuenta que sean 13-15",
        minLen: 13,
        maxLen: 15,
      },
      {
        id: "serie",
        label: "Número de serie",
        numeric: true,
        hint: "los primeros 4 dígitos SOLAMENTE del número de 12 dígitos",
        layout: "número de 12 dígitos impreso a la DERECHA del número de tarjeta — captura SOLO los primeros 4 (ej. si ves '250711103950', escribe '2507')",
        minLen: 4,
        maxLen: 4,
      },
      {
        id: "cvv",
        label: "CVV",
        numeric: true,
        hint: "3 dígitos en el panel holográfico inferior",
        layout: "los 3 dígitos en el área holográfica/satinada de la esquina inferior DERECHA — NO el número vertical del costado",
        minLen: 3,
        maxLen: 3,
      },
    ],
  },
  amazon: {
    name: "Amazon",
    fields: [
      {
        id: "codigo",
        label: "Código de canje",
        key: true,
        hint: "ej. WABU-VHRRFC-DAVA2",
        layout: "código alfanumérico con guiones bajo el área de rasca, sobre el código de barras",
      },
    ],
  },
  uber: {
    name: "Uber / Uber Eats",
    fields: [
      {
        id: "codigo",
        label: "Código de regalo",
        key: true,
        hint: "ej. LJVR6382049",
        layout: "código alfanumérico en el área de rasca inferior",
      },
    ],
  },
  codigo: {
    name: "Código único (Spotify, Netflix…)",
    fields: [
      {
        id: "codigo",
        label: "Código",
        key: true,
        hint: "código alfanumérico del área de rasca",
        layout: "código en el recuadro o área de raspa, ignora el código de barras numérico de abajo",
      },
    ],
  },
  tarjeta_serie: {
    name: "Tarjeta + Serie (sin CVV)",
    fields: [
      {
        id: "tarjeta",
        label: "Número de tarjeta",
        key: true,
        numeric: true,
        hint: "13 a 16 dígitos",
        minLen: 13,
        maxLen: 16,
      },
      {
        id: "serie",
        label: "Número de serie",
        numeric: true,
      },
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
