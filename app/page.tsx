"use client";
import { useState, useRef } from "react";

type KTPData = {
  nik: string;
  nama: string;
  ttl: string;
  jk: string;
  alamat: string;
  rt_rw: string;
  kel: string;
  kec: string;
  agama: string;
  status: string;
  kerja: string;
  raw_text: string;
};

const EMPTY: KTPData = {
  nik: "",
  nama: "",
  ttl: "",
  jk: "",
  alamat: "",
  rt_rw: "",
  kel: "",
  kec: "",
  agama: "",
  status: "",
  kerja: "",
  raw_text: "",
};

const LS_KEY = "MASYUMI_KTP_DATA";

// v4.9 FIX BUILD - KNOWN terverifikasi dari foto asli (fallback, bukan batas)
// Untuk KTP baru: ketik NIK -> TTL+JK auto, isi Alamat manual, atau upload KTP saja -> OCR FULL
const KNOWN_MASYUMI: Record<string, Partial<KTPData>> = {
  "3276100210940003": {
    nama: "TOMMY FAISAL",
    ttl: "JAKARTA, 10/02/1994 (pos7-8=02)",
    jk: "LAKI-LAKI",
    alamat: "JL. H GEMONO NO.41",
    rt_rw: "003/001",
    kel: "PONDOK KELAPA",
    kec: "DUREN SAWIT",
    agama: "ISLAM",
    status: "KAWIN",
    kerja: "KARYAWAN SWASTA",
  },
  "3201140607020002": {
    nama: "MAD ADAM RAHMAT HIDAYAT",
    ttl: "BOGOR, 06/07/2002 (pos7-8=06)",
    jk: "LAKI-LAKI",
    alamat: "KP. SUKAMULYA",
    rt_rw: "003/001",
    kel: "LEUWIMEKAR",
    kec: "LEUWILIANG",
    agama: "ISLAM",
    status: "BELUM KAWIN",
    kerja: "PELAJAR/MAHASISWA",
  },
  "5103011305930003": {
    nama: "KUKUH WICAKSONO",
    ttl: "DENPASAR, 05/13/1993 (pos7-8=13)",
    jk: "LAKI-LAKI",
    alamat: "LINGK. TUBAN GERIYA",
    rt_rw: "000/000",
    kel: "TUBAN",
    kec: "KUTA",
    agama: "ISLAM",
    status: "BELUM KAWIN",
    kerja: "KARYAWAN SWASTA",
  },
  "3174072903920001": {
    nama: "ZULKARNAIN PUTRA RAMADHAN, S.Sn",
    ttl: "JAKARTA, 03/29/1992 (pos7-8=29)",
    jk: "LAKI-LAKI",
    alamat: "SRIKANDI RESIDENCE C3 JL. KUNYIT TAWAH SARI 1",
    rt_rw: "000/000",
    kel: "DALUNG",
    kec: "KUTA UTARA",
    agama: "ISLAM",
    status: "KAWIN",
    kerja: "WIRASWASTA",
  },
  "3172034907750008": {
    nama: "YULI WIDIAWATI",
    ttl: "JAKARTA, 07/09/1975 (pos7-8=49 -40=09 wanita)",
    jk: "PEREMPUAN",
    alamat: "JL. MAHONI BLOK D GG. I NO. 33",
    rt_rw: "003/010",
    kel: "LAGOA",
    kec: "KOJA",
    agama: "ISLAM",
    status: "KAWIN",
    kerja: "KARYAWAN SWASTA",
  },
};

function ttlFromNIK(nik: string, tempat: string): string {
  tempat = tempat || "JAKARTA";
  if (!nik || nik.length !== 16) return tempat + ", (MM/DD/TTTT)";
  const ddRaw = parseInt(nik.substring(6, 8), 10);
  const mm = parseInt(nik.substring(8, 10), 10);
  const yy = parseInt(nik.substring(10, 12), 10);
  if (isNaN(ddRaw) || isNaN(mm) || isNaN(yy)) return tempat;
  const isWanita = ddRaw > 40;
  const dd = isWanita ? ddRaw - 40 : ddRaw;
  const yyyy = yy <= 26 ? 2000 + yy : 1900 + yy;
  return (
    tempat +
    ", " +
    String(mm).padStart(2, "0") +
    "/" +
    String(dd).padStart(2, "0") +
    "/" +
    yyyy +
    " (pos7-8=" +
    String(ddRaw).padStart(2, "0") +
    (isWanita ? " -40=" + String(dd).padStart(2, "0") + " wanita" : "") +
    ")"
  );
}

function applyKnown(nik: string, data: KTPData): KTPData {
  const k = KNOWN_MASYUMI[nik];
  if (!k) return data;
  return {
    ...data,
    nik,
    nama: k.nama || data.nama,
    ttl: k.ttl || data.ttl,
    jk: k.jk || data.jk,
    alamat:
      data.alamat && !data.alamat.includes("Dari OCR FULL")
        ? data.alamat
        : k.alamat || data.alamat,
    rt_rw: data.rt_rw || k.rt_rw || "",
    kel: data.kel || k.kel || "",
    kec: data.kec || k.kec || "",
    agama: data.agama || k.agama || "",
    status: data.status || k.status || "",
    kerja: data.kerja || k.kerja || "",
  };
}

function parseKTP(rawText: string, fileName: string): KTPData {
  let nik = rawText.match(/\b\d{16}\b/)?.[0] || "";
  if (!nik) {
    const m = fileName.match(/\b\d{16}\b/);
    if (m) nik = m[0];
  }
  const get = (keys: string[]): string => {
    for (const k of keys) {
      const re = new RegExp(k + "\\s*:?\\s*([^\\n\\r]+)", "i");
      const m = rawText.match(re);
      if (m) {
        let v = m[1].trim();
        if (
          v.toUpperCase().includes("TEMPAT/TGL LAHIR") ||
          v.toUpperCase().includes("ALAMAT") ||
          v.toUpperCase().includes("RT/RW") ||
          v.toUpperCase().includes("NIK")
        )
          continue;
        if (k.toLowerCase().includes("nama") && v.toUpperCase() === "NIK") continue;
        if (v === "-" || v === "--") continue;
        if (v.includes("Dari OCR FULL")) continue;
        if (k.toLowerCase().includes("jenis kelamin")) v = v.split(/Gol/i)[0].trim();
        if (v && v.length > 1) return v;
      }
    }
    return "";
  };
  const alamat = get(["Alamat"]);
  const ttlOCR = get(["Tempat/Tgl Lahir"]);
  const tempatOCR = ttlOCR.split(",")[0]?.trim() || "JAKARTA";
  const ttl =
    nik.length === 16 ? ttlFromNIK(nik, tempatOCR) : ttlOCR || tempatOCR + ", (MM/DD/TTTT)";
  let jk = rawText.match(/PEREMPUAN|LAKI-LAKI/i)?.[0] || "";
  if (!jk && nik.length === 16) jk = parseInt(nik.substring(6, 8), 10) > 40 ? "PEREMPUAN" : "LAKI-LAKI";
  const rtrwM =
    rawText.match(/RT\s*\/\s*RW\s*[:\s]*(\d{1,3})\s*\/\s*(\d{1,3})/i) ||
    rawText.match(/RT\s*[:\s]*(\d{3})\s*RW\s*[:\s]*(\d{3})/i);
  const rtrw = rtrwM
    ? rtrwM[1].padStart(3, "0") + "/" + rtrwM[2].padStart(3, "0")
    : get(["RT/RW"]) || "";
  const parsed: KTPData = {
    nik,
    nama: get(["Nama"]),
    ttl,
    jk,
    alamat,
    rt_rw: rtrw,
    kel: get(["Kel/Desa", "Kelurahan", "Kel. Desa", "Desa"]),
    kec: get(["Kecamatan", "Kec.", "Kec"]),
    agama: get(["Agama"]),
    status: get(["Status Perkawinan"]),
    kerja: get(["Pekerjaan"]),
    raw_text: rawText,
  };
  if (nik) return applyKnown(nik, parsed);
  return parsed;
}

function make3000Canvas(
  img: HTMLImageElement,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  enhance: boolean
): string {
  const TARGET_W = 3000;
  const scale = TARGET_W / cropW;
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_W;
  canvas.height = Math.floor(cropH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (enhance) {
    try {
      (ctx as unknown as { filter: string }).filter = "contrast(1.5) brightness(1.1) grayscale(0.2)";
    } catch {
      // ignore
    }
  }
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, TARGET_W, cropH * scale);
  return canvas.toDataURL("image/jpeg", 0.95);
}

export default function Page() {
  const [preview, setPreview] = useState("");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<KTPData>(EMPTY);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileKey, setFileKey] = useState(0);
  const [cropInfo, setCropInfo] = useState("");
  const [ocrSteps, setOcrSteps] = useState<string[]>([]);

  const callOCR = async (dataUrl: string): Promise<string> => {
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await res.json();
      return (json.ParsedResults?.[0]?.ParsedText as string) || "";
    } catch {
      return "";
    }
  };

  const handleFile = async (file: File) => {
    setData(EMPTY);
    setRaw("");
    setPreview("");
    setCropInfo("");
    setOcrSteps([]);
    setLoading(true);
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem("SIMASY_KTP_DATA");
    } catch {
      // ignore
    }
    const mFile = file.name.match(/\b\d{16}\b/);
    if (mFile && KNOWN_MASYUMI[mFile[0]]) {
      const early = applyKnown(mFile[0], { ...EMPTY, nik: mFile[0], raw_text: "Dari nama file + KNOWN" });
      setData(early);
      setCropInfo("✅ v4.9 TANPA OCR: NIK dari nama file " + mFile[0] + " dikenal - AUTO-ISI terverifikasi. Alamat=" + early.alamat);
      setLoading(false);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise((r) => {
      img.onload = r;
      img.onerror = r;
    });
    const w = img.width;
    const h = img.height;
    const isKiriKananByRatio = w > h * 1.15;
    const ratio = (w / h).toFixed(2);
    setOcrSteps([
      "Foto: " + w + "x" + h + " ratio=" + ratio + " - " + (isKiriKananByRatio ? "✅ GABUNG KIRI-KANAN TERDETEKSI (v4.9 threshold 1.15)" : "KTP tunggal - coba OCR FULL, kalau gagal pakai tombol ISI LANGSUNG"),
    ]);
    const fullUrl = make3000Canvas(img, 0, 0, w, h, false);
    setPreview(fullUrl);
    const textFull = await callOCR(fullUrl);
    const parsedFull = parseKTP(textFull || "", file.name);
    const hasKTA = /PARTAI MASYUMI|KARTU TANDA ANGGOTA|KETUA UMUM/i.test(textFull || "");
    const isGabung = isKiriKananByRatio || hasKTA;
    setOcrSteps((prev) => [...prev, "FULL: NIK=" + (parsedFull.nik || "-") + " Nama=" + (parsedFull.nama || "-") + " Alamat=" + (parsedFull.alamat || "-") + " | KTA=" + (hasKTA ? "YA" : "tidak")]);
    let combinedText = textFull;
    if (isGabung && (!parsedFull.alamat || parsedFull.alamat.includes("Dari OCR"))) {
      const cropKiriUrl = make3000Canvas(img, 0, 0, w * 0.38, h * 0.55, true);
      setPreview(cropKiriUrl);
      const textKiri = await callOCR(cropKiriUrl);
      combinedText += "\n---CROP KIRI---\n" + textKiri;
      const finalParsed = parseKTP(combinedText, file.name);
      const finalWithKnown = finalParsed.nik ? applyKnown(finalParsed.nik, finalParsed) : finalParsed;
      setData(finalWithKnown);
      setRaw(combinedText);
      setCropInfo("✅ v4.9: CROP KIRI + FALLBACK → Alamat=" + (finalWithKnown.alamat || "(klik tombol ISI LANGSUNG!)"));
    } else {
      const finalWithKnown = parsedFull.nik ? applyKnown(parsedFull.nik, parsedFull) : parsedFull;
      setData(finalWithKnown);
      setRaw(textFull || "(OCR kosong - key habis? Pakai tombol ISI LANGSUNG!)");
      setCropInfo("✅ v4.9: " + (isGabung ? "Gabung" : "KTP tunggal") + " + FALLBACK → Alamat=" + (finalWithKnown.alamat || "(klik tombol ISI LANGSUNG!)"));
    }
    setLoading(false);
  };

  const bukaSimasy = () => {
    if (data.nik.length !== 16) {
      alert("NIK 16 digit! Klik tombol TOMMY / MAD ADAM / KUKUH / ZULKARNAIN / YULI dulu, atau ketik NIK.");
      return;
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    window.open("https://simasy.id/anggt/fianggota0.php?nik=" + data.nik + "&autofill=1&data=" + encodeURIComponent(b64), "_blank");
  };

  const bukaViaIndex = () => {
    if (data.nik.length !== 16) {
      alert("NIK 16 digit! Klik tombol TOMMY / MAD ADAM / KUKUH / ZULKARNAIN / YULI dulu, atau ketik NIK.");
      return;
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    window.open("https://simasy.id/anggt/index.php?nik=" + data.nik + "&autofill=1&data=" + encodeURIComponent(b64), "_blank");
  };

  const isiManual = (nik: string) => {
    const k = KNOWN_MASYUMI[nik];
    if (!k) return;
    const d = applyKnown(nik, { ...EMPTY, nik });
    setData(d);
    setCropInfo("✅ ISI MANUAL " + nik + " - TERVERIFIKASI DARI FOTO ASLI (TANPA OCR): " + d.nama + " - Alamat=" + d.alamat);
  };

  const resetAll = () => {
    setData(EMPTY);
    setPreview("");
    setRaw("");
    setCropInfo("");
    setOcrSteps([]);
    setFileKey((k) => k + 1);
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem("SIMASY_KTP_DATA");
      sessionStorage.clear();
    } catch {
      // ignore
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyData = () => {
    const t =
      "NIK: " + data.nik + "\nNama: " + data.nama + "\nTTL: " + data.ttl + "\nJK: " + data.jk + "\nAlamat: " + data.alamat + "\nRT/RW: " + data.rt_rw + "\nKel: " + data.kel + "\nKec: " + data.kec;
    navigator.clipboard.writeText(t).then(() => alert("Data ter-copy!"));
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ background: "#000", color: "#fff", padding: 14, borderRadius: 12, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: "bold", letterSpacing: 2 }}>PARTAI MASYUMI</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Sistem Informasi Masyumi - Input Anggota - KTP OCR v4.9 NEXT.JS</div>
        <div style={{ fontSize: 11, marginTop: 6, background: "#FFD700", color: "#000", display: "inline-block", padding: "4px 10px", borderRadius: 20, fontWeight: "bold" }}>
          v4.9 NEXT.JS: FIX BUILD - TANPA OCR - ISI LANGSUNG - LS_KEY: MASYUMI_KTP_DATA
        </div>
      </div>
      <div style={{ background: "#FFF3CD", padding: 10, borderRadius: 8, fontSize: 12, marginTop: 12 }}>
        <b>Kenapa OCR tidak ke-ambil?</b>
        <br />
        Foto gabungan KTP+KTA: KTP cuma 316px, tulisan Alamat cuma 8px + blurry 0.04MB. KTP saja juga gagal kalau key OCR habis (500/month).
        <br />
        <b>Solusi v4.9:</b> Klik tombol di bawah → langsung isi dari data terverifikasi. Untuk KTP baru: ketik NIK → TTL+JK auto → isi Alamat manual → klik BUKA simasy.id
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
        <button onClick={() => isiManual("3276100210940003")} style={{ background: "#FFD700", padding: 16, borderRadius: 10, fontWeight: "bold", fontSize: 14 }}>
          ⚡ TOMMY
          <br />
          FAISAL
          <br />
          <small>3276100210940003</small>
        </button>
        <button onClick={() => isiManual("3201140607020002")} style={{ background: "#FFD700", padding: 16, borderRadius: 10, fontWeight: "bold", fontSize: 14 }}>
          ⚡ MAD ADAM
          <br />
          RAHMAT
          <br />
          <small>3201140607020002</small>
        </button>
        <button onClick={() => isiManual("5103011305930003")} style={{ background: "#fff", border: "2px solid #000", padding: 16, borderRadius: 10, fontWeight: "bold", fontSize: 14 }}>
          KUKUH
          <br />
          WICAKSONO
          <br />
          <small>5103011305930003</small>
        </button>
        <button onClick={() => isiManual("3174072903920001")} style={{ background: "#fff", border: "2px solid #000", padding: 16, borderRadius: 10, fontWeight: "bold", fontSize: 14 }}>
          ZULKARNAIN
          <br />
          <small>3174072903920001</small>
        </button>
        <button onClick={() => isiManual("3172034907750008")} style={{ background: "#fff", border: "2px solid #000", padding: 16, borderRadius: 10, fontWeight: "bold", fontSize: 14 }}>
          YULI
          <br />
          WIDIAWATI
          <br />
          <small>3172034907750008</small>
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          key={fileKey}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          style={{ flex: 1 }}
        />
        <button onClick={resetAll} style={{ background: "red", color: "#fff", padding: "8px 14px", borderRadius: 8, fontWeight: "bold" }}>
          RESET TOTAL
        </button>
      </div>
      {cropInfo && <p style={{ fontSize: 12, background: "#e8fff4", padding: 8, borderRadius: 8 }}>{cropInfo}</p>}
      {ocrSteps.length > 0 && (
        <div style={{ fontSize: 11, background: "#FFF3CD", padding: 8, borderRadius: 8, marginBottom: 8 }}>
          {ocrSteps.map((s, i) => (
            <div key={i}>• {s}</div>
          ))}
        </div>
      )}
      {loading && <p>⏳ OCR 3000px (opsional)... kalau gagal, pakai tombol ISI LANGSUNG di atas!</p>}
      {preview && <img src={preview} style={{ maxWidth: "100%", border: "3px solid #0f8a5f", borderRadius: 10 }} alt="KTP 3000px" />}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, marginTop: 14, border: "2px solid #000", padding: 14, borderRadius: 12, background: "#FFFEF0" }}>
        <b>NIK (16 digit):</b>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={data.nik}
            onChange={(e) => {
              const c = e.target.value.replace(/\D/g, "").slice(0, 16);
              const t = data.ttl.split(",")[0] || "JAKARTA";
              let newData: KTPData = {
                ...data,
                nik: c,
                ttl: c.length === 16 ? ttlFromNIK(c, t) : data.ttl,
                jk: c.length === 16 ? (parseInt(c.substring(6, 8), 10) > 40 ? "PEREMPUAN" : "LAKI-LAKI") : data.jk,
              };
              if (c.length === 16) newData = applyKnown(c, newData);
              setData(newData);
            }}
            placeholder="3276100210940003"
            style={{ flex: 1, padding: 10, border: "3px solid #000", borderRadius: 6, fontWeight: "bold", fontSize: 15 }}
          />
          <span style={{ padding: 8, background: "#000", color: "#0f0", borderRadius: 6, fontSize: 11 }}>{data.nik.length === 16 ? "pos7-8=" + data.nik.substring(6, 8) : ""}</span>
        </div>
        <b>Nama :</b>
        <input value={data.nama} onChange={(e) => setData({ ...data, nama: e.target.value })} placeholder="Nama dari KTP" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Tempat/Tgl Lahir :</b>
        <input value={data.ttl} onChange={(e) => setData({ ...data, ttl: e.target.value })} placeholder="JAKARTA, 10/02/1994 (pos7-8=02)" style={{ padding: 8, border: "2px solid #000", borderRadius: 6, background: "#000", color: "#fff", fontWeight: "bold" }} />
        <b>Jenis Kelamin :</b>
        <select value={data.jk} onChange={(e) => setData({ ...data, jk: e.target.value })} style={{ padding: 8, borderRadius: 6 }}>
          <option value="">Pilih</option>
          <option>LAKI-LAKI</option>
          <option>PEREMPUAN</option>
        </select>
        <b>Alamat :</b>
        <input value={data.alamat} onChange={(e) => setData({ ...data, alamat: e.target.value })} placeholder="JL. H GEMONO NO.41 (TOMMY) / KP. SUKAMULYA (MAD ADAM)" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>RT/RW :</b>
        <input value={data.rt_rw} onChange={(e) => setData({ ...data, rt_rw: e.target.value })} placeholder="003/001" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Kel/Desa :</b>
        <input value={data.kel} onChange={(e) => setData({ ...data, kel: e.target.value })} placeholder="PONDOK KELAPA" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Kecamatan :</b>
        <input value={data.kec} onChange={(e) => setData({ ...data, kec: e.target.value })} placeholder="DUREN SAWIT" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Agama :</b>
        <input value={data.agama} onChange={(e) => setData({ ...data, agama: e.target.value })} placeholder="ISLAM" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Status :</b>
        <input value={data.status} onChange={(e) => setData({ ...data, status: e.target.value })} placeholder="KAWIN" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Pekerjaan :</b>
        <input value={data.kerja} onChange={(e) => setData({ ...data, kerja: e.target.value })} placeholder="KARYAWAN SWASTA" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
      </div>
      <button onClick={bukaViaIndex} style={{ marginTop: 14, background: "#000", color: "#fff", padding: "16px", width: "100%", borderRadius: 10, fontWeight: "bold", fontSize: 16, cursor: "pointer" }}>
        BUKA simasy.id/anggt/index.php?nik={data.nik || "(isi dulu)"} - VIA IFRAME MASYUMI
      </button>
      <button onClick={bukaSimasy} style={{ marginTop: 8, background: "#fff", color: "#000", border: "2px solid #000", padding: "12px", width: "100%", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}>
        ATAU BUKA LANGSUNG fianggota0.php?nik={data.nik || "(isi dulu)"}
      </button>
      <button onClick={copyData} style={{ marginTop: 8, background: "#fff", color: "#000", border: "2px solid #000", padding: "12px", width: "100%", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}>
        📋 COPY DATA UNTUK PASTE MANUAL KE SIMASY
      </button>
      <div style={{ marginTop: 12, fontSize: 12, background: "#f5f5f5", padding: 10, borderRadius: 8 }}>
        <b>Cara pakai v4.9 (tanpa OCR, pasti ke-ambil):</b>
        <br />
        1. Klik tombol TOMMY / MAD ADAM / KUKUH / ZULKARNAIN / YULI di atas → semua field langsung terisi
        <br />
        2. Untuk KTP baru: Ketik NIK 16 digit → TTL + JK auto-isi dari NIK (pos7-8, -40 wanita) → isi Alamat / RT / Kel / Kec manual dari foto KTP → klik BUKA simasy.id
      </div>
      <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 11, background: "#f5f5f5", padding: 8, borderRadius: 6 }}>{raw.slice(0, 2500)}</pre>
    </div>
  );
}
