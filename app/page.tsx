"use client";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { TEMPLATES, Field } from "@/lib/templates";

type ImgItem = { name: string; base64: string; mediaType: string; url: string };
type Result = {
  img: ImgItem;
  extracted: Record<string, string>;
  conf: Record<string, string>;
  fieldStatus: Record<string, "ok" | "lowconf">;
  status: "ok" | "revisar";
  ocrError: string | null;
};

function norm(v: any, numeric?: boolean) {
  if (v == null) return "";
  let s = String(v).trim().toUpperCase().replace(/\s+/g, "");
  if (numeric) s = s.replace(/[^0-9]/g, "");
  return s;
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(file);
  });
}

export default function Home() {
  const [templateKey, setTemplateKey] = useState("liverpool");
  const template = TEMPLATES[templateKey];
  const fields = template.fields;

  const [images, setImages] = useState<ImgItem[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  async function onImages(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const files = Array.from(e.target.files || []);
    const loaded: ImgItem[] = [];
    for (const f of files) {
      try {
        const base64 = await fileToBase64(f);
        loaded.push({ name: f.name, base64, mediaType: f.type || "image/jpeg", url: URL.createObjectURL(f) });
      } catch {}
    }
    setImages((p) => [...p, ...loaded]);
  }

  async function extractOne(img: ImgItem): Promise<Result> {
    try {
      const r = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: img.base64, mediaType: img.mediaType, fields }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error de lectura");
      const extracted: Record<string, string> = {};
      const conf: Record<string, string> = data.confianza || {};
      const fieldStatus: Record<string, "ok" | "lowconf"> = {};
      fields.forEach((f) => {
        const val = data.campos?.[f.id] ?? "";
        extracted[f.id] = val == null ? "" : String(val);
        fieldStatus[f.id] = norm(val, f.numeric) === "" || conf[f.id] === "baja" ? "lowconf" : "ok";
      });
      const status = Object.values(fieldStatus).some((s) => s === "lowconf") ? "revisar" : "ok";
      return { img, extracted, conf, fieldStatus, status, ocrError: null };
    } catch (e: any) {
      const extracted: Record<string, string> = {};
      const fieldStatus: Record<string, "ok" | "lowconf"> = {};
      fields.forEach((f) => { extracted[f.id] = ""; fieldStatus[f.id] = "lowconf"; });
      return { img, extracted, conf: {}, fieldStatus, status: "revisar", ocrError: e?.message || "Error" };
    }
  }

  async function run() {
    setError("");
    if (!images.length) { setError("Sube al menos una foto."); return; }
    setRunning(true);
    setProgress({ done: 0, total: images.length });
    const out: Result[] = new Array(images.length);
    let next = 0, done = 0;
    const CONC = 4;
    async function worker() {
      while (next < images.length) {
        const i = next++;
        out[i] = await extractOne(images[i]);
        done++;
        setProgress({ done, total: images.length });
        setResults(out.filter(Boolean) as Result[]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, images.length) }, worker));
    setResults(out);
    setRunning(false);
  }

  function editValue(idx: number, fieldId: string, value: string) {
    setResults((prev) => {
      const copy = [...prev];
      const r = { ...copy[idx] };
      const f = fields.find((x) => x.id === fieldId)!;
      r.extracted = { ...r.extracted, [fieldId]: value };
      r.fieldStatus = { ...r.fieldStatus, [fieldId]: norm(value, f.numeric) === "" ? "lowconf" : "ok" };
      r.status = Object.values(r.fieldStatus).some((s) => s === "lowconf") ? "revisar" : "ok";
      copy[idx] = r;
      return copy;
    });
  }

  function exportExcel() {
    const header = ["#", "Archivo", ...fields.map((f) => f.label), "Estado"];
    const aoa: any[][] = [header];
    results.forEach((r, i) => {
      aoa.push([
        i + 1,
        r.img.name,
        ...fields.map((f) => r.extracted[f.id] ?? ""),
        r.status === "ok" ? "Capturado" : "REVISAR",
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // forzar texto en columnas de campos (evita notación científica / pérdida de dígitos)
    const textCols = fields.map((_, i) => i + 2); // tras # y Archivo
    for (let r = 1; r < aoa.length; r++) {
      textCols.forEach((c) => {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) { ws[ref].t = "s"; ws[ref].z = "@"; }
      });
    }
    ws["!cols"] = header.map((h) => ({ wch: Math.max(10, h.length + 4) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, template.name.slice(0, 28));
    XLSX.writeFile(wb, `premiaciones-${templateKey}-${Date.now()}.xlsx`);
  }

  const counts = useMemo(() => {
    const c = { ok: 0, revisar: 0 };
    results.forEach((r) => (r.status === "ok" ? c.ok++ : c.revisar++));
    return c;
  }, [results]);

  const sb = (s: string) =>
    s === "ok" ? { bg: "#eaf6ec", fg: "#1b7a35", t: "OK" } : { bg: "#fff6e3", fg: "#9a6b00", t: "⚠ REVISAR" };

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1 className="title">Captura de <span>Tarjetas</span></h1>
          <div className="sub">Premiaciones · BSM / Brainstore · sube fotos y baja el Excel</div>
        </div>
        <div className="badge">Lotes de ~50</div>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3><span className="num">1</span> Tipo de tarjeta</h3>
        <div className="row">
          <div className="fld">
            <span className="lbl">¿Qué tarjeta es este lote?</span>
            <select value={templateKey} onChange={(e) => { setTemplateKey(e.target.value); setResults([]); }}>
              {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          {fields.map((f) => (
            <span key={f.id} className="chip">{f.key ? <b>★ </b> : ""}{f.label}</span>
          ))}
        </div>
      </div>

      <div className="card">
        <h3><span className="num">2</span> Fotos del lote</h3>
        <input type="file" accept="image/*" multiple onChange={onImages} />
        {images.length > 0 && (
          <div className="note">
            {images.length} foto(s) cargadas.
            <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 12, marginLeft: 8 }}
              onClick={() => { setImages([]); setResults([]); }}>Limpiar</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: "center" }}>
          <button className="btn gold" onClick={run} disabled={running}>
            {running ? `Procesando ${progress.done}/${progress.total}…` : "Procesar lote"}
          </button>
          {results.length > 0 && !running && <button className="btn" onClick={exportExcel}>Descargar Excel</button>}
        </div>
        {running && <div className="prog"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
        <div className="note">Lee cada foto con visión IA. Las dudosas se marcan en amarillo para revisarlas antes de bajar el Excel.</div>
      </div>

      {results.length > 0 && (
        <>
          <div className="stats">
            <div className="stat"><div className="n" style={{ color: "#1b7a35" }}>{counts.ok}</div><div className="l">Capturadas</div></div>
            <div className="stat"><div className="n" style={{ color: "#B8902A" }}>{counts.revisar}</div><div className="l">Revisar</div></div>
          </div>
          <div className="res">
            {results.map((r, idx) => (
              <div key={idx} className={`item ${r.status !== "ok" ? "rev" : ""}`}>
                <img className="thumb" src={r.img.url} alt={r.img.name} />
                <div className="fields">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span className="fname">{r.img.name}</span>
                    <span className="statustag" style={{ background: r.status === "ok" ? "#eaf6ec" : "#fff6e3", color: r.status === "ok" ? "#1b7a35" : "#9a6b00" }}>
                      {r.status === "ok" ? "Capturada" : "Revisar"}
                    </span>
                  </div>
                  {r.ocrError && <div className="err" style={{ margin: 0 }}>{r.ocrError}</div>}
                  {fields.map((f) => {
                    const s = sb(r.fieldStatus[f.id]);
                    return (
                      <div className="frow" key={f.id}>
                        <span className="fk">{f.key ? "★ " : ""}{f.label}</span>
                        <input value={r.extracted[f.id] ?? ""} onChange={(e) => editValue(idx, f.id, e.target.value)} />
                        <span className="tag" style={{ background: s.bg, color: s.fg }}>{s.t}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
