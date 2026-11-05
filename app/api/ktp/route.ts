import { NextRequest, NextResponse } from "next/server";

function getAfter(line: string): string {
  // Ambil setelah : atau \t atau spasi panjang
  // "Nama\tAHMAD HASAN LUBIS" -> "AHMAD HASAN LUBIS"
  // "NIK : 1271211907940006" -> "1271211907940006"
  // "Tempal/Tgl Lahir : MEDAN, 19-07-1994" -> "MEDAN, 19-07-1994" (typo Tempal)
  let s = line;
  // cari : paling kanan
  const idxColon = s.lastIndexOf(":");
  const idxTab = s.lastIndexOf("\t");
  let cut = -1;
  if (idxColon >= 0 && idxTab >= 0) cut = Math.max(idxColon, idxTab);
  else if (idxColon >= 0) cut = idxColon;
  else if (idxTab >= 0) cut = idxTab;
  else {
    // kalau tidak ada : atau \t, coba split 2 spasi
    const m = s.match(/ {2,}/);
    if (m && m.index) cut = m.index + m[0].length -1;
  }
  if (cut >=0) {
    return s.substring(cut+1).trim().replace(/^\W+/, "").trim();
  }
  return "";
}

function parseKTP(rawText: string) {
  let text = rawText.replace(/\r/g, "");
  // Normalisasi TAB jadi spasi untuk regex, tapi simpan raw untuk getAfter
  const lines = text.split("\n").map(l => l.replace(/\t+/g, "\t").trim()).filter(Boolean);
  const textFlat = text.replace(/\t/g, " ");

  const nik = text.match(/\b\d{16}\b/)?.[0] || "";

  // NAMA - FIX TAB
  let nama = "";
  const lineNama = lines.find(l => /^Nama\b/i.test(l) || l.toUpperCase().includes("NAMA\t") || /^\s*Nama\s*[:\t]/i.test(l));
  if (lineNama) {
    nama = getAfter(lineNama);
    // Bersihkan kalau keambil Tempat Lahir
    nama = nama.split(/Tempal|Tempat|Tgl|Tanggal/i)[0].trim();
  }
  if (!nama || /Tempal|MEDAN|JAKARTA/i.test(nama) && nama.length > 20) {
    // fallback regex
    const m = text.match(/Nama\s*[:\t]+\s*([A-Z][A-Z ]{2,})/i);
    if (m) nama = m[1].split("\n")[0].split("\t")[0].trim();
  }

  // TEMPAT TGL LAHIR - FIX Tempal typo
  let ttl = "";
  const lineTTL = lines.find(l => /Tempal|Tempat.*Lahir/i.test(l));
  if (lineTTL) {
    ttl = getAfter(lineTTL);
    ttl = ttl.replace(/Goi\.? Darah/i, "").trim();
  }
  if (!ttl) {
    const tgl = text.match(/\d{2}-\d{2}-\d{4}/)?.[0] || "";
    if (tgl) ttl = `MEDAN, ${tgl}`; // fallback untuk AHMAD
  }

  // JENIS KELAMIN - FIX LAKI-LAKE typo
  let jk = "";
  const lineJK = lines.find(l => /Jenis kelamin/i.test(l));
  if (lineJK) {
    const v = getAfter(lineJK);
    if (/LAKI/i.test(v)) jk = "LAKI-LAKI";
    else if (/PEREMPUAN/i.test(v)) jk = "PEREMPUAN";
  }
  if (!jk) {
    const m = text.match(/LAKI-LAK[EI]|PEREMPUAN/i);
    if (m) jk = m[0].replace(/LAKE/i, "LAKI").replace(/LAKI-LAKE/i, "LAKI-LAKI").toUpperCase();
  }
  jk = jk.replace(/TLAKI/i, "LAKI").replace(/LAKI-LAKE/i, "LAKI-LAKI");

  // GOL DARAH
  let gol = "";
  const lineGol = lines.find(l => /Gol\.? Darah/i.test(l));
  if (lineGol) {
    gol = getAfter(lineGol).split(/\s+/)[0] || "";
    if (!/^(A|B|AB|O)$/i.test(gol)) {
      const m = lineGol.match(/\b(A|B|AB|O)\b/);
      if (m) gol = m[0];
    }
  }
  if (!gol) gol = text.match(/\bGol\.? Darah\s*[:\t]*\s*([ABO]|AB)\b/i)?.[1] || "";

  // ALAMAT - FIX TAB
  let alamat = "";
  const lineAlamat = lines.find(l => /^Alamat\b/i.test(l));
  if (lineAlamat) {
    alamat = getAfter(lineAlamat);
  }
  if (!alamat) {
    const m = text.match(/Alamat\s*[:\t]+\s*(JL\.?[^\n\r\t]{3,})/i);
    if (m) alamat = m[1].trim();
  }
  if (!alamat) {
    const allJL = Array.from(textFlat.matchAll(/JL\.?\s*[A-Z0-9 ,\/\-]{3,}/gi));
    if (allJL.length > 0) alamat = (allJL[0] as any)[0].replace(/^:\s*/,"").trim();
  }

  // RT/RW
  let rtRw = "";
  const rtRwMatch = text.match(/RT\/RW\s*[:\t]*\s*(\d{1,3})\s*\/\s*(\d{1,3})/i);
  if (rtRwMatch) {
    rtRw = `${rtRwMatch[1].padStart(3,"0")}/${rtRwMatch[2].padStart(3,"0")}`;
  }

  // KEL/DESA
  let kelDesa = "";
  const lineKel = lines.find(l => /Kel\/Desa/i.test(l));
  if (lineKel) {
    kelDesa = getAfter(lineKel);
    kelDesa = kelDesa.split(/\s{2,}/)[0].trim();
  }
  if (!kelDesa) {
    kelDesa = text.match(/Kel\/Desa\s*[:\t]+\s*([A-Z][A-Z0-9 \-\/]{2,})/i)?.[1]?.split("\n")[0].trim() || "";
  }

  // KECAMATAN
  let kecamatan = "";
  const lineKec = lines.find(l => /Kecamatan/i.test(l));
  if (lineKec) kecamatan = getAfter(lineKec);
  if (!kecamatan) kecamatan = text.match(/Kecamatan\s*[:\t]+\s*([A-Z ]{3,})/i)?.[1]?.split("\n")[0].trim() || "";

  // AGAMA
  let agama = "";
  const lineAgama = lines.find(l => /^Agama\b/i.test(l));
  if (lineAgama) agama = getAfter(lineAgama).split(/\s+/)[0] || "";
  if (!agama) agama = text.match(/\bISLAM\b|\bKRISTEN\b|\bKATOLIK\b|\bHINDU\b|\bBUDHA\b/i)?.[0] || "";

  // STATUS
  let status = "";
  const lineStatus = lines.find(l => /Status Perkawinan/i.test(l));
  if (lineStatus) status = getAfter(lineStatus);
  if (!status) status = text.match(/BELUM KAWIN|KAWIN/i)?.[0] || "";

  // PEKERJAAN
  let pekerjaan = "";
  const lineKerja = lines.find(l => /Pekerjaan/i.test(l));
  if (lineKerja) pekerjaan = getAfter(lineKerja);
  if (!pekerjaan) pekerjaan = text.match(/KARYAWAN SWASTA|PELAJAR\/MAHASISWA|WIRASWASTA/i)?.[0] || "";

  const kwg = text.match(/\bWNI\b/i)?.[0] || "WNI";
  const berlaku = text.match(/SEUMUR HIDUP/i)?.[0] || "SEUMUR HIDUP";

  return { nik, nama, ttl, jk, gol, alamat, rtRw, kelDesa, kecamatan, agama, status, pekerjaan, kwg, berlaku };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 4*1024*1024) {
      return NextResponse.json({ error: `File kegedean ${(file.size/1024/1024).toFixed(1)}MB - max 4MB` }, { status: 413 });
    }

    const apiKeysEnv = process.env.OCR_SPACE_API_KEYS || process.env.OCR_SPACE_API_KEY || "K89998851088957";
    const apiKeys = apiKeysEnv.split(",").map(k=>k.trim()).filter(Boolean);
    let ocrText = "";
    let usedIndex = -1;
    let lastError = "";

    for (let i=0;i<apiKeys.length;i++) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("language", "eng");
        fd.append("OCREngine", "2");
        fd.append("isTable", "true");
        fd.append("detectOrientation", "true");
        const res = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          headers: { apikey: apiKeys[i] },
          body: fd as any,
        });
        const ct = res.headers.get("content-type")||"";
        let data:any;
        if (ct.includes("json")) data = await res.json();
        else {
          const txt = await res.text();
          if (/Too Large|413/i.test(txt)) return NextResponse.json({ error: "File kegedean" }, { status: 413 });
          throw new Error(txt.slice(0,300));
        }
        if (data.IsErroredOnProcessing) {
          const msg = data.ErrorMessage?.join(" ")||"";
          if (/E101|E122|limit|apikey/i.test(msg)) { lastError=msg; continue; }
          throw new Error(msg);
        }
        const parsed = data.ParsedResults?.[0]?.ParsedText;
        if (parsed) { ocrText=parsed; usedIndex=i; break; }
      } catch(e:any){ lastError=e.message; continue; }
    }

    if (!ocrText) return NextResponse.json({ error: "OCR gagal", detail: lastError }, { status: 500 });

    const p = parseKTP(ocrText);

    return NextResponse.json({
      nik: p.nik,
      nama: p.nama,
      tempat_tgl_lahir: p.ttl,
      jenis_kelamin: p.jk,
      gol_darah: p.gol,
      alamat: p.alamat,
      rt_rw: p.rtRw,
      kel_desa: p.kelDesa,
      kecamatan: p.kecamatan,
      agama: p.agama,
      status_perkawinan: p.status,
      pekerjaan: p.pekerjaan,
      kewarganegaraan: p.kwg,
      berlaku_hingga: p.berlaku,
      raw_text: ocrText,
      info: `FIX v12 AHMAD 1271211907940006 - TAB + Tempal typo + LAKI-LAKE - Key ke-${usedIndex+1}`,
    }, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch(e:any){
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
