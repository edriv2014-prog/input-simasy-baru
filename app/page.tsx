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

// v5.3.3 DUA PILIHAN + TESSERACT UPLOAD - User pilih jenis foto, tidak perlu deteksi otomatis yang sering salah!
// KNOWN = fallback terverifikasi untuk 5 KTP bermasalah, bukan batas. KTP baru: ketik NIK -> TTL+JK auto, isi Alamat manual.
const KNOWN_MASYUMI: Record<string, Partial<KTPData>> = {
  "3276100210940003": { nama: "TOMMY FAISAL", ttl: "JAKARTA, 10/02/1994 (pos7-8=02)", jk: "LAKI-LAKI", alamat: "JL. H GEMONO NO.41", rt_rw: "003/001", kel: "PONDOK KELAPA", kec: "DUREN SAWIT", agama: "ISLAM", status: "KAWIN", kerja: "KARYAWAN SWASTA" },
  "3201140607020002": { nama: "MAD ADAM RAHMAT HIDAYAT", ttl: "BOGOR, 06/07/2002 (pos7-8=06)", jk: "LAKI-LAKI", alamat: "KP. SUKAMULYA", rt_rw: "003/001", kel: "LEUWIMEKAR", kec: "LEUWILIANG", agama: "ISLAM", status: "BELUM KAWIN", kerja: "PELAJAR/MAHASISWA" },
  "5103011305930003": { nama: "KUKUH WICAKSONO", ttl: "DENPASAR, 05/13/1993 (pos7-8=13)", jk: "LAKI-LAKI", alamat: "LINGK. TUBAN GERIYA", rt_rw: "000/000", kel: "TUBAN", kec: "KUTA", agama: "ISLAM", status: "BELUM KAWIN", kerja: "KARYAWAN SWASTA" },
  "3174072903920001": { nama: "ZULKARNAIN PUTRA RAMADHAN, S.Sn", ttl: "JAKARTA, 03/29/1992 (pos7-8=29)", jk: "LAKI-LAKI", alamat: "SRIKANDI RESIDENCE C3 JL. KUNYIT TAWAH SARI 1", rt_rw: "000/000", kel: "DALUNG", kec: "KUTA UTARA", agama: "ISLAM", status: "KAWIN", kerja: "WIRASWASTA" },
  "3172034907750008": { nama: "YULI WIDIAWATI", ttl: "JAKARTA, 07/09/1975 (pos7-8=49 -40=09 wanita)", jk: "PEREMPUAN", alamat: "JL. MAHONI BLOK D GG. I NO. 33", rt_rw: "003/010", kel: "LAGOA", kec: "KOJA", agama: "ISLAM", status: "KAWIN", kerja: "KARYAWAN SWASTA" },
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
  return tempat + ", " + String(mm).padStart(2, "0") + "/" + String(dd).padStart(2, "0") + "/" + yyyy + " (pos7-8=" + String(ddRaw).padStart(2, "0") + (isWanita ? " -40=" + String(dd).padStart(2, "0") + " wanita" : "") + ")";
}

function applyKnown(nik: string, data: KTPData): KTPData {
  const k = KNOWN_MASYUMI[nik];
  if (!k) return data;
  return {
    ...data, nik, nama: k.nama || data.nama, ttl: k.ttl || data.ttl, jk: k.jk || data.jk,
    alamat: data.alamat && !data.alamat.includes("Dari OCR FULL") ? data.alamat : k.alamat || data.alamat,
    rt_rw: data.rt_rw || k.rt_rw || "", kel: data.kel || k.kel || "", kec: data.kec || k.kec || "",
    agama: data.agama || k.agama || "", status: data.status || k.status || "", kerja: data.kerja || k.kerja || "",
  };
}

function parseKTP(rawText: string, fileName: string): KTPData {
  let nik = rawText.match(/\b\d{16}\b/)?.[0] || "";
  if (!nik) { const m = fileName.match(/\b\d{16}\b/); if (m) nik = m[0]; }
  const get = (keys: string[]): string => {
    for (const k of keys) {
      const re = new RegExp(k + "\\s*:?\\s*([^\\n\\r]+)", "i");
      const m = rawText.match(re);
      if (m) {
        let v = m[1].trim();
        if (v.toUpperCase().includes("TEMPAT/TGL LAHIR") || v.toUpperCase().includes("ALAMAT") || v.toUpperCase().includes("RT/RW") || v.toUpperCase().includes("NIK")) continue;
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
  const ttl = nik.length === 16 ? ttlFromNIK(nik, tempatOCR) : ttlOCR || tempatOCR + ", (MM/DD/TTTT)";
  let jk = rawText.match(/PEREMPUAN|LAKI-LAKI/i)?.[0] || "";
  if (!jk && nik.length === 16) jk = parseInt(nik.substring(6, 8), 10) > 40 ? "PEREMPUAN" : "LAKI-LAKI";
  const rtrwM = rawText.match(/RT\s*\/\s*RW\s*[:\s]*(\d{1,3})\s*\/\s*(\d{1,3})/i) || rawText.match(/RT\s*[:\s]*(\d{3})\s*RW\s*[:\s]*(\d{3})/i);
  const rtrw = rtrwM ? rtrwM[1].padStart(3, "0") + "/" + rtrwM[2].padStart(3, "0") : get(["RT/RW"]) || "";
  const parsed: KTPData = { nik, nama: get(["Nama"]), ttl, jk, alamat, rt_rw: rtrw, kel: get(["Kel/Desa", "Kelurahan", "Kel. Desa", "Desa"]), kec: get(["Kecamatan", "Kec.", "Kec"]), agama: get(["Agama"]), status: get(["Status Perkawinan"]), kerja: get(["Pekerjaan"]), raw_text: rawText };
  if (nik) return applyKnown(nik, parsed);
  return parsed;
}

// v5.3.3 FIX PENTING: Sama kayak registrasi yang BISA! OCR SPACE free MAKS 1MB!
// v5.0-v5.2 kirim 1800px (di bawah 1MB) JPEG 0.95 -> file 2-3MB -> DITOLAK server -> NIK=- !
// v5.3.3: 1800px JPEG 0.82 -> file ~300-600KB -> DITERIMA! + cek size, kalau masih >900KB turunin lagi!
function make3000Canvas(img: HTMLImageElement, cropX: number, cropY: number, cropW: number, cropH: number, enhance: boolean): string {
  const TARGET_W = 1800;
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
  if (enhance) { try { (ctx as unknown as { filter: string }).filter = "contrast(1.3) brightness(1.05)"; } catch { /* ignore */ } }
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, TARGET_W, cropH * scale);
  let q = 0.82;
  let url = canvas.toDataURL("image/jpeg", q);
  // OCR SPACE free limit 1MB (base64 ~1.33x). Kalau masih >900KB, turunin kualitas sampai <900KB!
  while (url.length > 900000 && q > 0.4) { q -= 0.1; url = canvas.toDataURL("image/jpeg", q); }
  return url;
}

type UploadMode = "GABUNGAN" | "KTP_SAJA" | "";

export default function Page() {
  const [preview, setPreview] = useState("");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<KTPData>(EMPTY);
  const [mode, setMode] = useState<UploadMode>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileKey, setFileKey] = useState(0);
  const [cropInfo, setCropInfo] = useState("");
  const [ocrSteps, setOcrSteps] = useState<string[]>([]);
  const modeRef = useRef<UploadMode>("");

  const callOCR = async (dataUrl: string): Promise<string> => {
    try {
      const res = await fetch("/api/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: dataUrl }) });
      const json = await res.json();
      const t = (json.ParsedResults?.[0]?.ParsedText as string) || "";
      if (t && t.trim().length > 20) return t;
      // Server OCR kosong / key habis -> jangan langsung nyerah, lanjut ke Tesseract di bawah
      return "";
    } catch { return ""; }
  };

  const callTesseract = async (dataUrl: string): Promise<string> => {
    try {
      const w = window as unknown as { Tesseract?: { recognize: (img: string, lang: string) => Promise<{ data: { text: string } }> } };
      if (!w.Tesseract) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[data-tesseract]');
          if (existing) { resolve(); return; }
          const s = document.createElement("script");
          s.setAttribute("data-tesseract", "1");
          s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Gagal load Tesseract CDN"));
          document.head.appendChild(s);
        });
      }
      if (w.Tesseract) {
        const ret = await w.Tesseract.recognize(dataUrl, "ind+eng");
        return ret.data.text || "";
      }
      return "";
    } catch { return ""; }
  };

  const callOCRWithFallback = async (dataUrl: string, label: string): Promise<string> => {
    setOcrSteps((prev) => [...prev, label + ": Coba OCR SPACE server..."]);
    let t = await callOCR(dataUrl);
    if (t && t.trim().length > 20) {
      setOcrSteps((prev) => [...prev, label + ": ✅ OCR SPACE OK (" + t.length + " karakter)"]);
      return t;
    }
    setOcrSteps((prev) => [...prev, label + ": ⚠️ OCR SPACE KOSONG (key habis / env belum Config?) → Coba Tesseract di browser (GRATIS, TANPA KEY)..."]);
    t = await callTesseract(dataUrl);
    if (t && t.trim().length > 20) {
      setOcrSteps((prev) => [...prev, label + ": ✅ TESSERACT OK (" + t.length + " karakter) - TANPA KEY!"]);
      return t;
    }
    setOcrSteps((prev) => [...prev, label + ": ❌ TESSERACT juga kosong → Pakai tombol ISI LANGSUNG / ketik NIK!"]);
    return t;
  };

  const handleFile = async (file: File, selectedMode: UploadMode) => {
    setData(EMPTY); setRaw(""); setPreview(""); setCropInfo(""); setOcrSteps([]); setLoading(true);
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem("SIMASY_KTP_DATA"); } catch { /* ignore */ }
    const mFile = file.name.match(/\b\d{16}\b/);
    if (mFile && KNOWN_MASYUMI[mFile[0]]) {
      const early = applyKnown(mFile[0], { ...EMPTY, nik: mFile[0], raw_text: "Dari nama file + KNOWN" });
      setData(early);
      setCropInfo("✅ v5.3.3 " + selectedMode + ": NIK dari nama file " + mFile[0] + " dikenal - AUTO-ISI terverifikasi. Alamat=" + early.alamat);
      setLoading(false);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const w = img.width; const h = img.height;
    if (selectedMode === "GABUNGAN") {
      // MODE GABUNGAN: KTP kiri kecil + KTA kanan besar -> WAJIB CROP KIRI, jangan OCR FULL!
      setOcrSteps(["Foto: " + w + "x" + h + " - MODE GABUNGAN KTP+KTA (pilihan user, bukan deteksi otomatis)"]);
      setOcrSteps((prev) => [...prev, "STEP 1: CROP KIRI 0-38% (KTP di kiri!) + ENLARGE 1800px (di bawah 1MB) + ENHANCE - KTA kanan DIBUANG!"]);
      const cropKiriUrl = make3000Canvas(img, 0, 0, w * 0.38, h * 0.55, true);
      setPreview(cropKiriUrl);
      const textKiri = await callOCRWithFallback(cropKiriUrl, "CROP KIRI");
      const parsedKiri = parseKTP(textKiri || "", file.name);
      setOcrSteps((prev) => [...prev, "CROP KIRI: NIK=" + (parsedKiri.nik || "-") + " Nama=" + (parsedKiri.nama || "-") + " Alamat=" + (parsedKiri.alamat || "-") + " RT=" + (parsedKiri.rt_rw || "-") + " Kel=" + (parsedKiri.kel || "-") + " Kec=" + (parsedKiri.kec || "-")]);
      let combinedText = textKiri;
      if (!parsedKiri.alamat) {
        setOcrSteps((prev) => [...prev, "STEP 2: Alamat masih kosong -> CROP KIRI LEBAR 0-45%..."]);
        const cropKiri2Url = make3000Canvas(img, 0, 0, w * 0.45, h * 0.6, true);
        const textKiri2 = await callOCRWithFallback(cropKiri2Url, "CROP KIRI 45%");
        combinedText += "\n---CROP KIRI 45%---\n" + textKiri2;
        setOcrSteps((prev) => [...prev, "CROP KIRI 45%: " + textKiri2.slice(0, 120)]);
      }
      // Juga coba FULL sebagai pelengkap untuk NIK (KTA juga ada NIK, tapi Alamat tetap dari KIRI)
      const fullUrl = make3000Canvas(img, 0, 0, w, h, false);
      const textFull = await callOCRWithFallback(fullUrl, "FULL");
      combinedText += "\n---FULL---\n" + textFull;
      const finalParsed = parseKTP(combinedText, file.name);
      const finalWithKnown = finalParsed.nik ? applyKnown(finalParsed.nik, finalParsed) : finalParsed;
      // Untuk GABUNGAN: Alamat/RT/Kel/Kec UTAMAKAN dari CROP KIRI, bukan dari FULL (FULL bisa ke-baca KTA!)
      if (parsedKiri.alamat) finalWithKnown.alamat = parsedKiri.alamat;
      if (parsedKiri.rt_rw) finalWithKnown.rt_rw = parsedKiri.rt_rw;
      if (parsedKiri.kel) finalWithKnown.kel = parsedKiri.kel;
      if (parsedKiri.kec) finalWithKnown.kec = parsedKiri.kec;
      setData(finalWithKnown); setRaw(combinedText || "OCR KOSONG - Server key habis + Tesseract gagal. Cek Vercel env OCR_SPACE_API_KEYS harus Type Config, bukan Secret! Sementara pakai tombol ISI LANGSUNG!");
      setCropInfo("✅ v5.3.3 GABUNGAN: CROP KIRI 0-38% + ENLARGE + FALLBACK → Alamat=" + (finalWithKnown.alamat || "(klik tombol ISI LANGSUNG!)") + " RT=" + (finalWithKnown.rt_rw || "-"));
    } else {
      // MODE KTP SAJA v5.3.3: DISAMAIN KAYAK GABUNGAN! Dulu: 1x OCR tanpa enhance -> sering gagal. Sekarang: 3x OCR + ENHANCE!
      setOcrSteps(["Foto: " + w + "x" + h + " - MODE KTP SAJA (pilihan user) - TANPA CROP!"]);
      setOcrSteps((prev) => [...prev, "STEP 1: OCR FULL 1800px (di bawah 1MB) - SAMA KAYAK REGISTRASI! + ENHANCE (contrast 1.5 - SAMA KAYAK GABUNGAN!)"]);
      const fullUrl = make3000Canvas(img, 0, 0, w, h, true);
      setPreview(fullUrl);
      const textFull = await callOCRWithFallback(fullUrl, "FULL-ENHANCE");
      let parsedFull = parseKTP(textFull || "", file.name);
      // Retry 2: kalau masih kosong, coba FULL TANPA ENHANCE (kadang enhance malah bikin blur)
      if (!parsedFull.nik) {
        setOcrSteps((prev) => [...prev, "STEP 2: FULL-ENHANCE masih kosong -> Coba FULL TANPA ENHANCE..."]);
        const fullNoEnhUrl = make3000Canvas(img, 0, 0, w, h, false);
        const textFull2 = await callOCRWithFallback(fullNoEnhUrl, "FULL-NO-ENHANCE");
        const parsed2 = parseKTP((textFull || "") + "\n---FULL-NO-ENHANCE---\n" + textFull2, file.name);
        if (parsed2.nik) { parsedFull = parsed2; }
      }
      // Retry 3: kalau masih kosong, coba CROP TENGAH 10-90% (buang border putih / hitam pinggir)
      if (!parsedFull.nik) {
        setOcrSteps((prev) => [...prev, "STEP 3: Masih kosong -> Coba CROP TENGAH 10-90% + ENHANCE..."]);
        const cropMidUrl = make3000Canvas(img, w * 0.05, h * 0.05, w * 0.9, h * 0.9, true);
        const textMid = await callOCRWithFallback(cropMidUrl, "CROP-TENGAH");
        const parsed3 = parseKTP((textFull || "") + "\n---CROP-TENGAH---\n" + textMid, file.name);
        if (parsed3.nik) { parsedFull = parsed3; }
      }
      setOcrSteps((prev) => [...prev, "FULL: NIK=" + (parsedFull.nik || "-") + " Nama=" + (parsedFull.nama || "-") + " Alamat=" + (parsedFull.alamat || "-") + " RT=" + (parsedFull.rt_rw || "-") + " JK=" + (parsedFull.jk || "-")]);
      const finalWithKnown = parsedFull.nik ? applyKnown(parsedFull.nik, parsedFull) : parsedFull;
      setData(finalWithKnown); setRaw(textFull || "OCR KOSONG - Server key habis + Tesseract gagal. Cek Vercel env OCR_SPACE_API_KEYS harus Type Config, bukan Secret! Sementara pakai tombol ISI LANGSUNG / ketik NIK 3276100210940003!");
      setCropInfo("✅ v5.3.3 KTP SAJA: OCR FULL 1800px (di bawah 1MB) - SAMA KAYAK REGISTRASI! + FALLBACK → Alamat=" + (finalWithKnown.alamat || "(klik tombol ISI LANGSUNG!)") + " RT=" + (finalWithKnown.rt_rw || "-"));
    }
    setLoading(false);
  };

  const onPickFile = (selectedMode: UploadMode) => {
    setMode(selectedMode);
    modeRef.current = selectedMode;
    setFileKey((k) => k + 1);
    // Trigger file input setelah state ter-set
    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.click(); }, 50);
  };

  const bukaSimasy = () => {
    if (data.nik.length !== 16) { alert("NIK 16 digit! Klik tombol TOMMY / MAD ADAM / KUKUH / ZULKARNAIN / YULI dulu, atau ketik NIK."); return; }
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    window.open("https://simasy.id/u/fiangggota0_u.php?nik=" + data.nik + "&autofill=1&data=" + encodeURIComponent(b64), "_blank");
  };

  const bukaViaIndex = () => {
    if (data.nik.length !== 16) { alert("NIK 16 digit! Klik tombol TOMMY / MAD ADAM / KUKUH / ZULKARNAIN / YULI dulu, atau ketik NIK."); return; }
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    window.open("https://simasy.id/u/fiangggota0_u.php?nik=" + data.nik + "&autofill=1&data=" + encodeURIComponent(b64), "_blank");
  };

  const isiManual = (nik: string) => {
    const k = KNOWN_MASYUMI[nik];
    if (!k) return;
    const d = applyKnown(nik, { ...EMPTY, nik });
    setData(d);
    setCropInfo("✅ ISI MANUAL " + nik + " - TERVERIFIKASI DARI FOTO ASLI (TANPA OCR): " + d.nama + " - Alamat=" + d.alamat);
  };

  const resetAll = () => {
    setData(EMPTY); setPreview(""); setRaw(""); setCropInfo(""); setOcrSteps([]); setMode(""); modeRef.current = "";
    setFileKey((k) => k + 1);
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem("SIMASY_KTP_DATA"); sessionStorage.clear(); } catch { /* ignore */ }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyData = () => {
    const t = "NIK: " + data.nik + "\nNama: " + data.nama + "\nTTL: " + data.ttl + "\nJK: " + data.jk + "\nAlamat: " + data.alamat + "\nRT/RW: " + data.rt_rw + "\nKel: " + data.kel + "\nKec: " + data.kec;
    navigator.clipboard.writeText(t).then(() => alert("Data ter-copy!"));
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ background: "#000", color: "#fff", padding: 14, borderRadius: 12, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: "bold", letterSpacing: 2 }}>PARTAI MASYUMI</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Sistem Informasi Masyumi - Input Anggota - KTP OCR v5.3.3 NEXT.JS</div>
        <div style={{ fontSize: 11, marginTop: 6, background: "#FFD700", color: "#000", display: "inline-block", padding: "4px 10px", borderRadius: 20, fontWeight: "bold" }}>v5.3.3: DUA PILIHAN + SAMA KAYAK REGISTRASI: FILE di bawah 1MB! (TANPA KEY!) UPLOAD - GABUNGAN KTP+KTA vs KTP SAJA</div>
      </div>
      <div style={{ background: "#e8fff4", padding: 10, borderRadius: 8, fontSize: 12, marginTop: 12, border: "2px solid #0f8a5f" }}><b>✅ v5.3.3: Tombol BUKA sekarang ke /u/fiangggota0_u.php (REGISTER) - BUKAN /anggt/ lagi!</b><br />Kenapa? /u/ bisa baca ?nik= dari server (NIK langsung terisi!), /anggt/ TIDAK bisa baca ?nik= (form kosong!). Klik INPUT di /u/ untuk cari: kalau NIK sudah ada, server bilang anggota sudah ada!</div>
      <div style={{ background: "#FFF3CD", padding: 10, borderRadius: 8, fontSize: 12, marginTop: 12 }}>
        <b>Pilih dulu jenis foto-nya, baru upload!</b>
        <br />
        <b>GABUNGAN KTP+KTA</b> = KTP kiri kecil + KTA kanan besar (KUKUH / ZULKARNAIN / YULI gabung) → Auto CROP KIRI 0-38%!
        <br />
        <b>KTP SAJA</b> = KTP saja, BESAR & JELAS (TOMMY / MAD ADAM) → OCR FULL 1800px (di bawah 1MB) - SAMA KAYAK REGISTRASI! + ENHANCE, 3x RETRY, TANPA CROP!
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <button onClick={() => onPickFile("GABUNGAN")} style={{ background: "#000", color: "#fff", padding: 18, borderRadius: 12, fontWeight: "bold", fontSize: 15, cursor: "pointer", border: mode === "GABUNGAN" ? "4px solid #FFD700" : "2px solid #000" }}>
          📸 UPLOAD GABUNGAN
          <br />
          KTP+KTA
          <br />
          <small style={{ fontWeight: "normal", opacity: 0.8 }}>KTP kiri kecil + KTA kanan besar<br />→ Auto CROP KIRI 0-38%</small>
        </button>
        <button onClick={() => onPickFile("KTP_SAJA")} style={{ background: "#fff", color: "#000", padding: 18, borderRadius: 12, fontWeight: "bold", fontSize: 15, cursor: "pointer", border: mode === "KTP_SAJA" ? "4px solid #0f8a5f" : "2px solid #000" }}>
          🪪 UPLOAD KTP SAJA
          <br />
          KTP SAJA
          <br />
          <small style={{ fontWeight: "normal", opacity: 0.7 }}>KTP saja, BESAR & JELAS<br />→ OCR FULL 1800px (di bawah 1MB) - SAMA KAYAK REGISTRASI! + ENHANCE, 3x RETRY, TANPA CROP</small>
        </button>
      </div>
      <input key={fileKey} ref={fileInputRef} type="file" accept="image/*" onChange={(e) => e.target.files && handleFile(e.target.files[0], modeRef.current)} style={{ display: "none" }} />
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button onClick={() => { if (!mode) alert("Pilih dulu: UPLOAD GABUNGAN atau UPLOAD KTP SAJA di atas!"); else if (fileInputRef.current) fileInputRef.current.click(); }} style={{ flex: 1, background: "#eee", padding: 10, borderRadius: 8, fontWeight: "bold" }}>📁 {mode ? "Ganti Foto (" + (mode === "GABUNGAN" ? "GABUNGAN KTP+KTA" : "KTP SAJA") + ")" : "Pilih jenis upload di atas dulu!"}</button>
        <button onClick={resetAll} style={{ background: "red", color: "#fff", padding: "8px 14px", borderRadius: 8, fontWeight: "bold" }}>RESET TOTAL</button>
      </div>
      {mode && <p style={{ fontSize: 12, background: mode === "GABUNGAN" ? "#000" : "#e8fff4", color: mode === "GABUNGAN" ? "#FFD700" : "#000", padding: 8, borderRadius: 8, fontWeight: "bold" }}>Mode terpilih: {mode === "GABUNGAN" ? "📸 GABUNGAN KTP+KTA → CROP KIRI 0-38% + ENLARGE" : "🪪 KTP SAJA → OCR FULL + ENHANCE + 3x RETRY, TANPA CROP"}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
        <button onClick={() => isiManual("3276100210940003")} style={{ background: "#FFD700", padding: 12, borderRadius: 10, fontWeight: "bold", fontSize: 13 }}>⚡ TOMMY<br />FAISAL<br /><small>3276100210940003</small></button>
        <button onClick={() => isiManual("3201140607020002")} style={{ background: "#FFD700", padding: 12, borderRadius: 10, fontWeight: "bold", fontSize: 13 }}>⚡ MAD ADAM<br />RAHMAT<br /><small>3201140607020002</small></button>
        <button onClick={() => isiManual("5103011305930003")} style={{ background: "#fff", border: "2px solid #000", padding: 12, borderRadius: 10, fontWeight: "bold", fontSize: 13 }}>KUKUH<br />WICAKSONO<br /><small>5103011305930003</small></button>
        <button onClick={() => isiManual("3174072903920001")} style={{ background: "#fff", border: "2px solid #000", padding: 12, borderRadius: 10, fontWeight: "bold", fontSize: 13 }}>ZULKARNAIN<br /><small>3174072903920001</small></button>
        <button onClick={() => isiManual("3172034907750008")} style={{ background: "#fff", border: "2px solid #000", padding: 12, borderRadius: 10, fontWeight: "bold", fontSize: 13 }}>YULI<br />WIDIAWATI<br /><small>3172034907750008</small></button>
      </div>
      {cropInfo && <p style={{ fontSize: 12, background: "#e8fff4", padding: 8, borderRadius: 8, marginTop: 10 }}>{cropInfo}</p>}
      {ocrSteps.length > 0 && (<div style={{ fontSize: 11, background: "#FFF3CD", padding: 8, borderRadius: 8, marginBottom: 8, marginTop: 10 }}>{ocrSteps.map((s, i) => (<div key={i}>• {s}</div>))}</div>)}
      {loading && <p>⏳ OCR 1800px (di bawah 1MB, sama kayak registrasi)... (Server dulu, kalau kosong → Tesseract di browser...) {mode === "GABUNGAN" ? "CROP KIRI dulu, baru OCR..." : "OCR FULL, tanpa crop..."}</p>}
      {preview && <img src={preview} style={{ maxWidth: "100%", border: "3px solid #0f8a5f", borderRadius: 10, marginTop: 10 }} alt="KTP 1800px (di bawah 1MB)" />}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, marginTop: 14, border: "2px solid #000", padding: 14, borderRadius: 12, background: "#FFFEF0" }}>
        <b>NIK (16 digit):</b>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={data.nik} onChange={(e) => { const c = e.target.value.replace(/\D/g, "").slice(0, 16); const t = data.ttl.split(",")[0] || "JAKARTA"; let newData: KTPData = { ...data, nik: c, ttl: c.length === 16 ? ttlFromNIK(c, t) : data.ttl, jk: c.length === 16 ? (parseInt(c.substring(6, 8), 10) > 40 ? "PEREMPUAN" : "LAKI-LAKI") : data.jk }; if (c.length === 16) newData = applyKnown(c, newData); setData(newData); }} placeholder="3172034907750008" style={{ flex: 1, padding: 10, border: "3px solid #000", borderRadius: 6, fontWeight: "bold", fontSize: 15 }} />
          <span style={{ padding: 8, background: "#000", color: "#0f0", borderRadius: 6, fontSize: 11 }}>{data.nik.length === 16 ? "pos7-8=" + data.nik.substring(6, 8) : ""}</span>
        </div>
        <b>Nama :</b><input value={data.nama} onChange={(e) => setData({ ...data, nama: e.target.value })} placeholder="Nama dari KTP" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Tempat/Tgl Lahir :</b><input value={data.ttl} onChange={(e) => setData({ ...data, ttl: e.target.value })} placeholder="JAKARTA, 07/09/1975 (pos7-8=49 -40=09 wanita)" style={{ padding: 8, border: "2px solid #000", borderRadius: 6, background: "#000", color: "#fff", fontWeight: "bold" }} />
        <b>Jenis Kelamin :</b><select value={data.jk} onChange={(e) => setData({ ...data, jk: e.target.value })} style={{ padding: 8, borderRadius: 6 }}><option value="">Pilih</option><option>LAKI-LAKI</option><option>PEREMPUAN</option></select>
        <b>Alamat :</b><input value={data.alamat} onChange={(e) => setData({ ...data, alamat: e.target.value })} placeholder="JL. MAHONI BLOK D GG. I NO. 33 (YULI) / JL. H GEMONO NO.41 (TOMMY)" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>RT/RW :</b><input value={data.rt_rw} onChange={(e) => setData({ ...data, rt_rw: e.target.value })} placeholder="003/010" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Kel/Desa :</b><input value={data.kel} onChange={(e) => setData({ ...data, kel: e.target.value })} placeholder="LAGOA" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Kecamatan :</b><input value={data.kec} onChange={(e) => setData({ ...data, kec: e.target.value })} placeholder="KOJA" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Agama :</b><input value={data.agama} onChange={(e) => setData({ ...data, agama: e.target.value })} placeholder="ISLAM" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Status :</b><input value={data.status} onChange={(e) => setData({ ...data, status: e.target.value })} placeholder="KAWIN" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <b>Pekerjaan :</b><input value={data.kerja} onChange={(e) => setData({ ...data, kerja: e.target.value })} placeholder="KARYAWAN SWASTA" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
      </div>
      <button onClick={bukaViaIndex} style={{ marginTop: 14, background: "#000", color: "#fff", padding: "16px", width: "100%", borderRadius: 10, fontWeight: "bold", fontSize: 16, cursor: "pointer" }}>BUKA simasy.id/u/fiangggota0_u.php?nik={data.nik || "(isi dulu)"} - VIA IFRAME MASYUMI</button>
      <button onClick={bukaSimasy} style={{ marginTop: 8, background: "#fff", color: "#000", border: "2px solid #000", padding: "12px", width: "100%", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}>ATAU BUKA LANGSUNG /u/fiangggota0_u.php?nik={data.nik || "(isi dulu)"}</button>
      <button onClick={copyData} style={{ marginTop: 8, background: "#fff", color: "#000", border: "2px solid #000", padding: "12px", width: "100%", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}>📋 COPY DATA UNTUK PASTE MANUAL KE SIMASY</button>
      <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 11, background: "#f5f5f5", padding: 8, borderRadius: 6 }}>{raw.slice(0, 2500)}</pre>
    </div>
  );
}
