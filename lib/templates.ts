export type Field = {
  id: string;
  label: string;
  hint?: string;
  numeric?: boolean;
  key?: boolean;
};
export type Template = { name: string; fields: Field[] };

const monto: Field = { id: "monto", label: "Monto (MXN)", hint: "solo el número, ej. 250", numeric: true };

export const TEMPLATES: Record<string, Template> = {
  liverpool: {
    name: "Liverpool (monedero)",
    fields: [
      { id: "tarjeta", label: "Número de tarjeta", key: true, hint: "13 díg., ej. 8120029334190", numeric: true },
      { id: "serie", label: "Número de serie", hint: "12 díg., ej. 250509135950", numeric: true },
      { id: "cvv", label: "CVV", hint: "3 díg., ej. 250", numeric: true },
      monto,
    ],
  },
  amazon: {
    name: "Amazon",
    fields: [
      { id: "codigo", label: "Código de canje", key: true, hint: "ej. WABU-VHRRFC-DAVA2" },
      monto,
    ],
  },
  uber: {
    name: "Uber / Uber Eats",
    fields: [
      { id: "codigo", label: "Código de regalo", key: true, hint: "ej. LJVR6382049" },
      monto,
    ],
  },
  codigo: {
    name: "Código único (Spotify, Netflix…)",
    fields: [
      { id: "codigo", label: "Código", key: true },
      monto,
    ],
  },
  tarjeta_serie: {
    name: "Tarjeta + Serie (sin CVV)",
    fields: [
      { id: "tarjeta", label: "Número de tarjeta", key: true, numeric: true },
      { id: "serie", label: "Número de serie", numeric: true },
      monto,
    ],
  },
};
