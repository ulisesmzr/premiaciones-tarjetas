"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function entrar() {
    setError(""); setLoading(true);
    const r = await fetch("/api/auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clave }),
    });
    setLoading(false);
    if (r.ok) router.push("/"); else setError("Clave incorrecta.");
  }

  return (
    <div className="login">
      <div className="loginbox">
        <h1 className="title">Premiaciones <span>·</span></h1>
        <div className="sub" style={{ marginBottom: 22 }}>Acceso para áreas · BSM / Brainstore</div>
        {error && <div className="err">{error}</div>}
        <div className="fld" style={{ width: "100%" }}>
          <span className="lbl">Clave de acceso</span>
          <input
            type="password" value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            style={{ width: "100%" }}
          />
        </div>
        <button className="btn gold" style={{ width: "100%", marginTop: 18 }} onClick={entrar} disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}
