"use client";
import { useEffect, useState } from "react";

type KtpData = {
  nik?: string; nama?: string; tempat_tgl_lahir?: string;
  alamat?: string; rt_rw?: string; kel_desa?: string;
  kecamatan?: string; no_anggota?: string; raw_text?: string;
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
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.filter = "contrast(1.4) brightness(1.15) grayscale(0.2)";
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => {
        if (!b) { resolve(file); return; }
        resolve(new File([b], file.name, { type: "image/jpeg" }));
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
  const [rawOcr, setRawOcr] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [mode] = useState<"ktp_kta">("ktp_kta");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f); setData(null); setRawOcr(""); setErrorMsg("");
    if (f) setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setErrorMsg(""); setData(null);
    try {
      let uploadFile = file;
      if (file.size > 3.8 * 1024 * 1024 || file.size < 0.5 * 1024 * 1024) {
        uploadFile = await compressImage(file);
      }
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("mode", mode);
      const res = await fetch("/api/ktp", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) setErrorMsg(json.error);
      else { setData(json); setRawOcr(json.raw_text || ""); }
    } catch (err: any) { setErrorMsg(err.message); }
    finally { setLoading(false); }
  };

  const openSimasy = () => {
    if (!data?.nik) return;
    const nik16 = data.nik.replace(/\D/g, "").slice(0,16);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `https://simasy.id/u/fianggota1_u.php?txt_noktp=${nik16}&statuskirim=1&autofill=1`;
    form.target = "_blank";
    form.style.display = "none";
    const payload: Record<string,string> = {
      txt_noktp: nik16, nik: nik16, statuskirim: "1",
      no_anggota: data.no_anggota || "2215090967270",
      nama: data.nama || "",
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
      <h1 style={{ fontSize: 20, fontWeight: "bold" }}>KTP - Input Simasy (OCR Only)</h1>
      <p style={{ fontSize: 11, color: "#666" }}>FIX v11 FINAL 3000px - Rekam Data oleh Admin/Petugas</p>
      
      <div style={{ border: "1px solid #ccc", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
        {preview && <div style={{ marginTop: 10 }}><img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 380, border: "1px solid #ddd", borderRadius: 6 }} /></div>}
        <button onClick={handleUpload} disabled={!file || loading} style={{ marginTop: 12, background: "#0F8A5F", color: "#fff", padding: "10px 18px", borderRadius: 8, border: "none", fontWeight: "bold", cursor: "pointer", opacity: !file || loading ? 0.5 : 1 }}>
          {loading ? "Membaca KTP..." : "📷 Baca KTP+KTA"}
        </button>
        {errorMsg && <div style={{ color: "#b91c1c", background: "#fef2f2", padding: 8, borderRadius: 6, marginTop: 10, fontSize: 13 }}>⚠ {errorMsg}</div>}
      </div>

      {data && (
        <div style={{ marginTop: 20, border: "2px solid #0F8A5F", borderRadius: 10, padding: 15, background: "#f9fffe" }}>
          <h2 style={{ fontWeight: "bold" }}>HASIL OCR - Siap untuk Admin</h2>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 6, fontSize: 14, marginTop: 10 }}>
            <b>NIK:</b> <span>{data.nik}</span>
            <b>Nama:</b> <span>{data.nama}</span>
            <b>No Anggota:</b> <span>{data.no_anggota}</span>
            <b>Alamat:</b> <span>{data.alamat}</span>
            <b>Kel/Desa:</b> <span>{data.kel_desa}</span>
          </div>
          <button onClick={openSimasy} style={{ marginTop: 15, background: "#000", color: "#fff", padding: "14px 18px", borderRadius: 10, width: "100%", fontWeight: "bold", fontSize: 15, cursor: "pointer" }}>
            🚀 Buka di Simasy.id (Admin Klik Rekam Data)
          </button>
          <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Tugas Next.js hanya sampai buka Simasy, Rekam Data dilakukan admin/petugas di simasy.id</p>
          <details style={{ marginTop: 12 }}><summary style={{ fontSize: 12, cursor: "pointer" }}>Raw OCR</summary><pre style={{ fontSize: 10, background: "#f5f5f5", padding: 8, whiteSpace: "pre-wrap" }}>{rawOcr}</pre></details>
        </div>
      )}
    </div>
  );
}