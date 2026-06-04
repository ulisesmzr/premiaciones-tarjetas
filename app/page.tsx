"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { TEMPLATES, keyField, norm } from "@/lib/templates";

type Img = { name: string; base64: string; mediaType: string; url: string };
type Card = {
  campos: Record<string, string>;
  conf: Record<string, string>;
  key_value: string;
  status: "ok" | "revisar" | "duplicada";
  dupReason?: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(file);
  });
}

export default function Home() {
  const [view, setView] = useState<"projects" | "project">("projects");
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const [current, setCurrent] = useState<any>(null);
  const [savedCount, setSavedCount] = useState(0);

  const [brand, setBrand] = useState("liverpool");
  const [monto, setMonto] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [results, setResults] = useState<Card[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);

  const fields = TEMPLATES[brand].fields;
  const kf = keyField(brand);

  async function loadProjects() {
    setLoading(true);
    try {
      const r = await fetch("/api/projects");
      const d = await r.json();
      setProjects(d.projects || []);
    } catch { setError("No se pudieron cargar los proyectos."); }
    setLoading(false);
  }
  useEffect(() => { loadProjects(); }, []);

  async function createProject() {
    if (!newName.trim()) return;
    const r = await fetch("/api/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), target: Number(newTarget) || 0 }),
    });
    if (r.ok) { setNewName(""); setNewTarget(""); loadProjects(); }
  }

  async function openProject(id: string) {
    setError(""); setInfo("");
    const r = await fetch("/api/projects/" + id);
    const d = await r.json();
    setCurrent(d.project);
    setSavedCount((d.cards || []).length);
    setImages([]); setResults([]); setMonto(""); setBrand("liverpool");
    setView("project");
  }

  function backToProjects() { setView("projects"); setCurrent(null); setError(""); setInfo(""); loadProjects(); }

  async function onImages(e: any) {
    const files = Array.from(e.target.files || []) as File[];
    const loaded: Img[] = [];
    for (const f of files) {
      try { const base64 = await fileToBase64(f); loaded.push({ name: f.name, base64, mediaType: f.type || "image/jpeg", url: URL.createObjectURL(f) }); } catch {}
    }
    setImages((p) => [...p, ...loaded]);
  }

  function computeStatus(campos: any, conf: any): "ok" | "revisar" {
    for (const f of fields) {
      const v = norm(campos[f.id], f.numeric);
      if (v === "" || conf[f.id] === "baja") return "revisar";
    }
    return "ok";
  }

  async function process() {
    setError(""); setInfo("");
    if (!images.length) { setError("Sube al menos una foto."); return; }
    if (!monto.trim()) { setError("Pon el monto del lote antes de leer las tarjetas."); return; }
    setProcessing(true);
    setProgress({ done: 0, total: images.length });
    const all: Card[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < images.length; i++) {
      try {
        const r = await fetch("/api/extract", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageBase64: images[i].base64, mediaType: images[i].mediaType, brand }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Error de lectura");
        for (const t of (d.tarjetas || [])) {
          const campos = t.campos || {}, conf = t.confianza || {}, kv = t.key_value || "";
          let status: "ok" | "revisar" | "duplicada", dupReason = "";
          if (t.dupInDb) { status = "duplicada"; dupReason = "Ya existe en otro lote/proyecto"; }
          else if (kv && seen.has(kv)) { status = "duplicada"; dupReason = "Repetida en este mismo lote"; }
          else status = computeStatus(campos, conf);
          if (kv && status !== "duplicada") seen.add(kv);
          all.push({ campos, conf, key_value: kv, status, dupReason });
        }
      } catch (e: any) {
        all.push({ campos: {}, conf: {}, key_value: "", status: "revisar", dupReason: e?.message });
      }
      setProgress({ done: i + 1, total: images.length });
      setResults([...all]);
    }
    setProcessing(false);
  }

  function editField(idx: number, fid: string, val: string) {
    setResults((prev) => {
      const copy = [...prev];
      const c = { ...copy[idx] };
      c.campos = { ...c.campos, [fid]: val };
      if (c.status !== "duplicada") c.status = computeStatus(c.campos, c.conf);
      c.key_value = norm(c.campos[kf.id], kf.numeric);
      copy[idx] = c;
      return copy;
    });
  }
  function discard(idx: number) {
    setResults((prev) => prev.filter((_, i) => i !== idx));
  }

  const counts = useMemo(() => {
    let ok = 0, rev = 0, dup = 0;
    for (const c of results) { if (c.status === "ok") ok++; else if (c.status === "duplicada") dup++; else rev++; }
    return { ok, rev, dup };
  }, [results]);

  const okCards = useMemo(() => results.filter((c) => c.status === "ok"), [results]);
  const reviewList = useMemo(() => results.map((c, i) => ({ c, i })).filter((x) => x.c.status !== "ok"), [results]);

  async function saveBatch() {
    if (!current) return;
    if (!okCards.length) { setError("No hay tarjetas listas (sin errores) para guardar."); return; }
    setSaving(true); setError(""); setInfo("");
    try {
      const payload = okCards.map((c) => ({ key_value: c.key_value, data: c.campos }));
      const r = await fetch("/api/cards", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: current.id, brand, monto, cards: payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error al guardar");
      setSavedCount((c) => c + (d.saved || 0));
      setImages([]); setResults([]);
      setInfo(`Guardadas ${d.saved} tarjeta(s) en el proyecto.` + (d.skipped ? ` ${d.skipped} se omitieron por duplicado.` : ""));
    } catch (e: any) { setError(e?.message || "Error al guardar"); }
    setSaving(false);
  }

  async function exportExcel() {
    if (!current) return;
    setError(""); setInfo("");
    const r = await fetch("/api/projects/" + current.id);
    const d = await r.json();
    const cards = d.cards || [];
    if (!cards.length) { setError("Este proyecto aún no tiene tarjetas guardadas."); return; }
    const byBrand: Record<string, any[]> = {};
    for (const c of cards) (byBrand[c.brand] = byBrand[c.brand] || []).push(c);
    const wb = XLSX.utils.book_new();
    for (const b of Object.keys(byBrand)) {
      const tpl = TEMPLATES[b]; if (!tpl) continue;
      const header = ["#", ...tpl.fields.map((f) => f.label), "Monto (MXN)"];
      const aoa: any[][] = [header];
      byBrand[b].forEach((c, i) => {
        aoa.push([i + 1, ...tpl.fields.map((f) => c.data?.[f.id] ?? ""), c.monto ?? ""]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      for (let row = 1; row < aoa.length; row++) {
        for (let col = 1; col < header.length; col++) {
          const ref = XLSX.utils.encode_cell({ r: row, c: col });
          if (ws[ref]) { ws[ref].t = "s"; ws[ref].z = "@"; }
        }
      }
      ws["!cols"] = header.map((h) => ({ wch: Math.max(10, String(h).length + 4) }));
      XLSX.utils.book_append_sheet(wb, ws, tpl.name.slice(0, 28));
    }
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${String(current.name).replace(/[^\w]+/g, "-")}-${Date.now()}.xlsx`;
    a.click();
  }

  // ===== RENDER =====
  if (view === "projects") {
    return (
      <div className="wrap">
        <div className="head">
          <div>
            <h1 className="title">Premiaciones · <span>Proyectos</span></h1>
            <div className="sub">Campañas de tarjetas · BSM / Brainstore</div>
          </div>
          <div className="badge">Captura por campaña</div>
        </div>

        {error && <div className="err">{error}</div>}

        <div className="card">
          <h3><span className="num">+</span> Nueva campaña</h3>
          <div className="row">
            <div className="fld" style={{ flex: 1, minWidth: 220 }}>
              <span className="lbl">Nombre de la campaña</span>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Campaña Premios 1" style={{ padding: "10px 12px", border: "1px solid #ccc", fontFamily: "DM Sans" }} />
            </div>
            <div className="fld">
              <span className="lbl">Meta (total de tarjetas)</span>
              <input type="number" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="Ej. 500" style={{ padding: "10px 12px", border: "1px solid #ccc", width: 160, fontFamily: "DM Sans" }} />
            </div>
            <button className="btn gold" onClick={createProject}>Crear campaña</button>
          </div>
        </div>

        {loading ? <div className="note">Cargando…</div> : (
          <div className="pgrid">
            {projects.length === 0 && <div className="note">Aún no hay campañas. Crea la primera arriba.</div>}
            {projects.map((p) => {
              const pct = p.target ? Math.min(100, Math.round((p.captured / p.target) * 100)) : 0;
              return (
                <div key={p.id} className="pcard" onClick={() => openProject(p.id)}>
                  <div className="pcard-name">{p.name}</div>
                  <div className="pcard-count">{p.captured}{p.target ? ` / ${p.target}` : ""} <span>tarjetas</span></div>
                  {p.target ? <div className="pbar"><i style={{ width: pct + "%" }} /></div> : null}
                  <div className="pcard-open">Abrir →</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // project view
  const pct = current?.target ? Math.min(100, Math.round((savedCount / current.target) * 100)) : 0;
  return (
    <div className="wrap">
      <div className="head">
        <div>
          <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 12, marginBottom: 10 }} onClick={backToProjects}>← Campañas</button>
          <h1 className="title">{current?.name}</h1>
          <div className="sub">
            Acumuladas: <b>{savedCount}</b>{current?.target ? ` de ${current.target}` : ""} tarjetas
          </div>
          {current?.target ? <div className="pbar" style={{ maxWidth: 360, marginTop: 8 }}><i style={{ width: pct + "%" }} /></div> : null}
        </div>
        <div className="badge">{pct ? pct + "%" : "En curso"}</div>
      </div>

      {error && <div className="err">{error}</div>}
      {info && <div className="okmsg">{info}</div>}

      <div className="card">
        <h3><span className="num">1</span> Configura el lote</h3>
        <div className="row">
          <div className="fld">
            <span className="lbl">Marca / tipo de tarjeta</span>
            <select value={brand} onChange={(e) => { setBrand(e.target.value); setResults([]); }}>
              {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
            </select>
          </div>
          <div className="fld">
            <span className="lbl">Monto de TODAS las de este lote (MXN)</span>
            <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej. 200" style={{ padding: "10px 12px", border: "1px solid #ccc", width: 200, fontFamily: "DM Mono" }} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {fields.map((f) => <span key={f.id} className="chip">{f.key ? <b>★ </b> : ""}{f.label}</span>)}
        </div>
        <div className="note">El monto lo pones tú y se aplica a todas las tarjetas de este lote.</div>
      </div>

      <div className="card">
        <h3><span className="num">2</span> Sube las fotos</h3>
        <input type="file" accept="image/*" multiple onChange={onImages} />
        {images.length > 0 && (
          <div className="note">
            {images.length} foto(s) cargadas. Una foto puede tener varias tarjetas.
            <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 12, marginLeft: 8 }} onClick={() => { setImages([]); setResults([]); }}>Vaciar</button>
          </div>
        )}
      </div>

      <div className="card">
        <button className="btn gold" onClick={process} disabled={processing} style={{ fontSize: 15 }}>
          {processing ? `Leyendo ${progress.done}/${progress.total}…` : "Leer y capturar tarjetas"}
        </button>
        <div className="note">Lee las fotos con IA, identifica cada tarjeta (aunque haya varias en una foto), detecta duplicados y separa las que necesitan revisión.</div>
        {processing && <div className="prog"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
      </div>

      {results.length > 0 && (
        <>
          <div className="stats">
            <div className="stat"><div className="n" style={{ color: "#1b7a35" }}>{counts.ok}</div><div className="l">Capturadas perfecto</div></div>
            <div className="stat"><div className="n" style={{ color: "#B8902A" }}>{counts.rev}</div><div className="l">Por revisar</div></div>
            <div className="stat"><div className="n" style={{ color: "#c0392b" }}>{counts.dup}</div><div className="l">Duplicadas</div></div>
          </div>

          {reviewList.length === 0 ? (
            <div className="okmsg">Todas las tarjetas se leyeron perfecto. Ya puedes guardarlas en la campaña.</div>
          ) : (
            <>
              <div className="note" style={{ marginBottom: 8 }}>Solo se muestran las que necesitan tu atención. Las {counts.ok} perfectas no se listan.</div>
              <div className="res">
                {reviewList.map(({ c, i }) => (
                  <div key={i} className="item rev">
                    <div className="fields">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span className="statustag" style={{ background: c.status === "duplicada" ? "#fdecec" : "#fff6e3", color: c.status === "duplicada" ? "#c0392b" : "#9a6b00" }}>
                          {c.status === "duplicada" ? "Duplicada" : "Revisar"}
                        </span>
                        <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => discard(i)}>Descartar</button>
                      </div>
                      {c.dupReason && <div className="note" style={{ margin: 0, color: c.status === "duplicada" ? "#c0392b" : "#9a6b00" }}>{c.dupReason}</div>}
                      {fields.map((f) => (
                        <div className="frow" key={f.id}>
                          <span className="fk">{f.key ? "★ " : ""}{f.label}</span>
                          <input value={c.campos[f.id] ?? ""} onChange={(e) => editField(i, f.id, e.target.value)} disabled={c.status === "duplicada"} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <button className="btn" onClick={saveBatch} disabled={saving || !okCards.length}>
              {saving ? "Guardando…" : `Guardar ${okCards.length} tarjeta(s) en la campaña`}
            </button>
            <div className="note">Se guardan solo las que están sin errores. Las duplicadas se bloquean. Las de "revisar" debes corregirlas o descartarlas.</div>
          </div>
        </>
      )}

      <div className="bottombar">
        <button className="btn gold" onClick={exportExcel} style={{ width: "100%", fontSize: 15, padding: "16px" }}>
          Crear Excel (consolidado de toda la campaña)
        </button>
        <div className="note" style={{ textAlign: "center" }}>Una pestaña por marca, con sus montos. Incluye TODO lo acumulado en esta campaña.</div>
      </div>
    </div>
  );
}
