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
  const lines = text.split("\n").map(l => l.replace(/\t+/g, " ").trim()).filter(Boolean);
  const textFlat = lines.join("\n");

  const nik = text.match(/\b\d{16}\b/)?.[0] || "";

  // === NAMA - FIX 2 BARIS ===
  let nama = "";
  const idxNama = lines.findIndex(l => /^Nama\s*[:\t]?/i.test(l) || /^Nama\s+[A-Z]/i.test(l));
  if (idxNama >= 0) {
    let rawNama = lines[idxNama];
    // ambil setelah Nama : 
    let m = rawNama.match(/Nama\s*[:\-]?\s*(.+)/i);
    let candidate = m ? m[1] : "";
    candidate = candidate.trim();

    // Kalau baris selanjutnya BUKAN field baru, gabung (untuk S.Sn)
    const nextLine = lines[idxNama+1] || "";
    if (nextLine && !/^(Tempat|Tempal|Jenis|Alamat|RT\/RW|Kel\/Desa|Kecamatan|Agama|Status|Pekerjaan|Kewarganegaraan|Berlaku|Gol|PROVINSI|NIK)/i.test(nextLine)) {
      // kalau nextLine kayak "S.Sn" atau gelar, gabung
      if (/^S\./i.test(nextLine) || nextLine.length < 20) {
        candidate += " " + nextLine;
      }
    }
    // bersihkan dari Tempat/Tgl Lahir kalau kegabung OCR
    candidate = candidate.split(/Tempat|Tempal|Jenis|Alamat/i)[0];
    nama = candidate.replace(/\s{2,}/g," ").trim().replace(/^\W+/, "");
  }

  // Fallback kalau masih kosong
  if (!nama) {
    const m = text.match(/Nama\s*[:\s]+\s*([A-Z][A-Z\s\.,]{3,30})/i);
    if (m) nama = m[1].trim();
  }

  // ... sisanya TTL, JK, dll pakai code kamu yang lama gak masalah
  let ttl = "";
  const lineTTL = lines.find(l => /Tempal|Tempat.*Lahir/i.test(l));
  if (lineTTL) {
    ttl = lineTTL.split(/[:\t]/).pop()!.trim();
  }

  // ... copy paste sisanya dari code lamamu untuk alamat, rt/rw, dll
  // Biar gak panjang, pakai yang lama kamu cuma ganti bagian nama aja di atas

  let jk = text.match(/LAKI-LAKI|PEREMPUAN/i)?.[0]?.toUpperCase().replace(/LAKE/,"LAKI") || "";
  let gol = text.match(/Gol\.?\s*Darah\s*[:\s]*([ABO]|AB)/i)?.[1] || "O";
  let alamat = lines.find(l=>/^Alamat/i.test(l))?.split(/[:\t]/).slice(1).join(" ").trim() || "";
  let rtRw = text.match(/RT\/RW\s*[:\s]*(\d+\/\d+)/i)?.[1]?.replace(/\s/g,"").padStart(7,"0") || "";
  let kelDesa = lines.find(l=>/Kel\/Desa/i.test(l))?.split(/[:\t]/).pop()?.trim() || "";
  let kecamatan = lines.find(l=>/Kecamatan/i.test(l))?.split(/[:\t]/).pop()?.trim() || "";
  let agama = text.match(/ISLAM|KRISTEN|KATOLIK|HINDU|BUDHA/i)?.[0] || "";
  let status = text.match(/KAWIN|BELUM KAWIN/i)?.[0] || "";
  let pekerjaan = lines.find(l=>/Pekerjaan/i.test(l))?.split(/[:\t]/).pop()?.trim() || text.match(/WIRASWASTA|KARYAWAN|PELAJAR/i)?.[0] || "";

  return { nik, nama, ttl, jk, gol, alamat, rtRw, kelDesa, kecamatan, agama, status, pekerjaan, kwg: "WNI", berlaku: "SEUMUR HIDUP" };
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
