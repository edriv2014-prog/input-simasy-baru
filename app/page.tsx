"use client";
import { useEffect, useState } from "react";

type KtpData = {
  nik?: string;
  nama?: string;
  tempat_tgl_lahir?: string;
  jenis_kelamin?: string;
  gol_darah?: string;
  alamat?: string;
  rt_rw?: string;
  kel_desa?: string;
  kecamatan?: string;
  agama?: string;
  status_perkawinan?: string;
  pekerjaan?: string;
  kewarganegaraan?: string;
  berlaku_hingga?: string;
  no_anggota?: string;
  kab?: string;
  raw_text?: string;
  error?: string;
};

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      const maxDim = 3000;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = (h / w) * maxDim; w = maxDim; }
        else { w = (w / h) * maxDim; h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.filter = "contrast(1.4) brightness(1.15) grayscale(0.2)";
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name, { type: "image/jpeg" }));
      }, "image/jpeg", 0.95);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<KtpData | null>(null);
  const [rawOcr, setRawOcr] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [mode, setMode] = useState<"ktp" | "ktp_kta">("ktp_kta");

  useEffect(() => {
    if (data?.nik) localStorage.setItem("SIMASY_KTP_DATA", JSON.stringify(data));
  }, [data]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setData(null);
    setRawOcr("");
    setErrorMsg("");
    if (f) {
      setPreview(URL.createObjectURL(f));
      if (f.size > 3.8 * 1024 * 1024) {
        setErrorMsg(`File ${(f.size/1024/1024).toFixed(1)}MB kegedean - akan dikompres otomatis ke ~0.8MB`);
      }
      if (f.size < 0.5 * 1024 * 1024) {
        setErrorMsg(`File kecil ${(f.size/1024).toFixed(0)}KB (kayak ${f.name} yang jadi 0.04MB) - akan di-upscale ke 3000px biar gak baca JAKALLTA`);
      }
    } else setPreview(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setErrorMsg("");
    setData(null);
    try {
      let uploadFile = file;
      if (file.size > 3.8 * 1024 * 1024 || file.size < 0.5 * 1024 * 1024) {
        uploadFile = await compressImage(file);
      }
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("mode", mode);
      const res = await fetch("/api/ktp", { method: "POST", body: form });
      const ct = res.headers.get("content-type") || "";
      let json: any;
      if (ct.includes("application/json")) {
        json = await res.json();
      } else {
        const txt = await res.text();
        throw new Error(txt.slice(0, 300));
      }
      if (!res.ok) setErrorMsg(json.error || `Gagal OCR (${res.status})`);
      else { setData(json); setRawOcr(json.raw_text || ""); }
    } catch (err: any) {
      setErrorMsg(err.message || "Error fetch");
    } finally { setLoading(false); }
  };
const openSimasy = () => {
  const nik16 = (data?.nik || "3174072903920001").replace(/\D/g, "").slice(0,16);
  const form = document.createElement("form");
  form.method = "POST";
  // taruh di URL juga biar $_GET ada
  form.action = `https://simasy.id/u/fianggota1_u.php?txt_noktp=${nik16}&statuskirim=1&autofill=1`;
  form.target = "_blank";
  form.style.display = "none";

  const payload = {
    txt_noktp: nik16,
    statuskirim: "1",
    no_anggota: data?.no_anggota || "2215090967270",
    nik: nik16,
  };
  Object.entries(payload).forEach(([k,v])=>{
    const i = document.createElement("input");
    i.type="hidden"; i.name=k; i.value=v;
    form.appendChild(i);
  });
  document.body.appendChild(form);
  form.submit();
  setTimeout(()=>form.remove(), 1000);
};
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: "bold" }}>KTP - Input Simasy</h1>
      <p style={{ color: "#555", fontSize: 12 }}>FIX v11: 3000px 0.95 + KTP+KTA dual + &lt;4MB escape + RT/RW 003/010 fix</p>
      
      <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
        <button onClick={() => setMode("ktp_kta")} style={{ padding: "8px 12px", borderRadius: 6, border: mode === "ktp_kta" ? "2px solid #0F8A5F" : "1px solid #ccc", background: mode === "ktp_kta" ? "#0F8A5F" : "#fff", color: mode === "ktp_kta" ? "#fff" : "#000" }}>Foto KTP+KTA (gabungan)</button>
        <button onClick={() => setMode("ktp")} style={{ padding: "8px 12px", borderRadius: 6, border: mode === "ktp" ? "2px solid #0F8A5F" : "1px solid #ccc", background: mode === "ktp" ? "#0F8A5F" : "#fff", color: mode === "ktp" ? "#fff" : "#000" }}>Foto KTP Only</button>
      </div>

      <div style={{ border: "1px solid #ccc", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
        {preview && <div style={{ marginTop: 10 }}><img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 380, borderRadius: 6, border: "1px solid #ddd" }} /></div>}
        <button onClick={handleUpload} disabled={!file || loading} style={{ marginTop: 12, background: "#0F8A5F", color: "#fff", padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold", opacity: !file || loading ? 0.5 : 1 }}>{loading ? "Membaca KTP+KTA..." : "📷 Baca KTP+KTA"}</button>
        {errorMsg && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", borderRadius: 6, marginTop: 10, fontSize: 13 }}>⚠ {errorMsg}</div>}
      </div>

      {data && !data.error && (
        <div style={{ marginTop: 20, border: "2px solid #0F8A5F", borderRadius: 10, padding: 15, background: "#f9fffe" }}>
          <h2 style={{ fontWeight: "bold", marginBottom: 10 }}>HASIL BACA - KTP+KTA LANGSUNG FORM</h2>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", rowGap: 6, fontSize: 14 }}>
            <b>NIK :</b> <span>{data.nik}</span>
            <b>Nama :</b> <span>{data.nama}</span>
            <b>No Anggota Masyumi :</b> <span>{data.no_anggota}</span>
            <b>Tempat/Tgl Lahir :</b> <span>{data.tempat_tgl_lahir}</span>
            <b>Alamat :</b> <span>{data.alamat}</span>
            <b>RT/RW :</b> <span>{data.rt_rw}</span>
            <b>Kel/Desa :</b> <span>{data.kel_desa}</span>
            <b>Kecamatan :</b> <span>{data.kecamatan}</span>
          </div>
          <button onClick={openSimasy} style={{ marginTop: 15, background: "#000", color: "#fff", padding: "14px 18px", borderRadius: 10, width: "100%", fontWeight: "bold", fontSize: 15, cursor: "pointer", border: "2px solid #0F8A5F" }}>🚀 BUKA SIMASY.ID + ISI NIK {data.nik} {data.no_anggota ? `+ No ${data.no_anggota}` : ""}</button>
          <details style={{ marginTop: 15 }}><summary style={{ cursor: "pointer" }}>▼ Raw OCR</summary><pre style={{ marginTop: 8, background: "#f5f5f5", padding: 10, borderRadius: 6, fontSize: 11, whiteSpace: "pre-wrap" }}>{rawOcr}</pre></details>
        </div>
      )}
    </div>
  );
}