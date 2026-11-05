"use client";
import { useState, useEffect } from "react";

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
  raw_text?: string;
  error?: string;
};

// Kompres gambar di browser sebelum upload biar <4MB
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      const maxDim = 1600; // max 1600px
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = (h / w) * maxDim; w = maxDim; }
        else { w = (w / h) * maxDim; h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const newFile = new File([blob], file.name, { type: "image/jpeg" });
        console.log(`Kompres: ${(file.size/1024/1024).toFixed(2)}MB -> ${(newFile.size/1024/1024).toFixed(2)}MB`);
        resolve(newFile);
      }, "image/jpeg", 0.7); // quality 70%
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
      if (f.size > 4 * 1024 * 1024) {
        setErrorMsg(`File ${(f.size/1024/1024).toFixed(1)}MB kegedean - akan dikompres otomatis jadi ~1MB pas upload`);
      }
    } else setPreview(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setErrorMsg("");
    setData(null);
    try {
      // Kompres dulu kalau >1.5MB
      let uploadFile = file;
      if (file.size > 1.5 * 1024 * 1024) {
        uploadFile = await compressImage(file);
      }

      const form = new FormData();
      form.append("file", uploadFile);

      const res = await fetch("/api/ktp", { method: "POST", body: form });

      // FIX: kalau server bales HTML (Request Entity Too Large), jangan parse JSON
      const contentType = res.headers.get("content-type") || "";
      let json: any;
      if (contentType.includes("application/json")) {
        json = await res.json();
      } else {
        const txt = await res.text();
        // Kalau Vercel limit
        if (txt.includes("Request Entity Too Large") || txt.includes("413") || res.status === 413) {
          throw new Error(`File kegedean ${(file.size/1024/1024).toFixed(1)}MB - max 4MB. Coba foto ulang lebih dekat, jangan pakai 12MP. Hasil kompres masih ${ (uploadFile.size/1024/1024).toFixed(1)}MB`);
        }
        throw new Error(txt.slice(0,300));
      }

      if (!res.ok) {
        setErrorMsg(json.error || `Gagal OCR (${res.status})`);
      } else {
        setData(json);
        setRawOcr(json.raw_text || "");
      }
    } catch (err: any) {
      // FIX: jangan muncul Unexpected token R
      if (err.message && err.message.includes("Unexpected token")) {
        setErrorMsg(`File kegedean atau server sibuk. Coba kompres foto dulu atau foto ulang lebih dekat (max 4MB). Error: ${err.message.slice(0,150)}`);
      } else {
        setErrorMsg(err.message || "Error fetch");
      }
    } finally {
      setLoading(false);
    }
  };

  const openSimasy = () => {
    if (!data?.nik) return;
    localStorage.setItem("SIMASY_KTP_DATA", JSON.stringify(data));
    const url = `https://simasy.id/u/fianggota0_u.php?nik=${encodeURIComponent(data.nik)}&autofill=1`;
    window.open(url, "_blank");
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: "bold" }}>KTP - Input Simasy</h1>
      <p style={{ color: "#555", fontSize: 12 }}>FIX v10: auto-kompres <4MB + RT/RW 003 / 010 fix + Kel/Desa PONDOK KELAPA/LAGOA + tombol hitam di website anti-loop</p>

      <div style={{ border: "1px solid #ccc", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
        {preview && (
          <div style={{ marginTop: 10 }}>
            <img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 380, borderRadius: 6, border: "1px solid #ddd" }} />
            {file && <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Size: {(file.size/1024/1024).toFixed(2)}MB {file.size > 4*1024*1024 ? " - AKAN DIKOMPRES" : ""}</div>}
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            marginTop: 12,
            background: "#0F8A5F",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: "bold",
            opacity: !file || loading ? 0.5 : 1,
          }}
        >
          {loading ? "Membaca KTP..." : "📷 Baca KTP"}
        </button>
        {errorMsg && (
          <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 10px", borderRadius: 6, marginTop: 10, fontSize: 13 }}>
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {data && !data.error && (
        <div style={{ marginTop: 20, border: "2px solid #0F8A5F", borderRadius: 10, padding: 15, background: "#f9fffe" }}>
          <h2 style={{ fontWeight: "bold", marginBottom: 10 }}>HASIL BACA KTP - URUTAN KTP</h2>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", rowGap: 6, fontSize: 14 }}>
            <b>NIK :</b> <span>{data.nik}</span>
            <b>Nama :</b> <span>{data.nama}</span>
            <b>Tempat/Tgl Lahir :</b> <span>{data.tempat_tgl_lahir}</span>
            <b>Jenis Kelamin :</b> <span>{data.jenis_kelamin}</span>
            <b>Gol. Darah :</b> <span>{data.gol_darah}</span>
            <b>Alamat :</b> <span>{data.alamat}</span>
            <b>RT/RW :</b> <span>{data.rt_rw}</span>
            <b>Kel/Desa :</b> <span>{data.kel_desa}</span>
            <b>Kecamatan :</b> <span>{data.kecamatan}</span>
            <b>Agama :</b> <span>{data.agama}</span>
            <b>Status Perkawinan :</b> <span>{data.status_perkawinan}</span>
            <b>Pekerjaan :</b> <span>{data.pekerjaan}</span>
            <b>Kewarganegaraan :</b> <span>{data.kewarganegaraan}</span>
            <b>Berlaku Hingga :</b> <span>{data.berlaku_hingga}</span>
          </div>

          <div style={{ marginTop: 15 }}>
            <button
              onClick={openSimasy}
              style={{
                background: "#000",
                color: "#fff",
                padding: "14px 18px",
                borderRadius: 10,
                width: "100%",
                fontWeight: "bold",
                fontSize: 15,
                cursor: "pointer",
                border: "2px solid #0F8A5F",
                lineHeight: 1.3,
              }}
            >
              🚀 BUKA SIMASY.ID + ISI NIK {data.nik}
              <br />
              <span style={{ fontWeight: "normal", fontSize: 11 }}>{data.nama} - {data.kel_desa}</span>
            </button>
          </div>

          <details style={{ marginTop: 15 }}>
            <summary style={{ cursor: "pointer", fontSize: 14 }}>▼ Lihat Raw OCR</summary>
            <pre style={{ marginTop: 8, background: "#f5f5f5", padding: 10, borderRadius: 6, fontSize: 11, whiteSpace: "pre-wrap" }}>{rawOcr}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
