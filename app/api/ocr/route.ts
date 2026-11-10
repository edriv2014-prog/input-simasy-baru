
import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest){
  try{
    const { image } = await req.json();
    const rawKeys = process.env.OCR_SPACE_API_KEYS || '';
    const OCR_KEYS = rawKeys.split(',').map((k:string)=>k.trim()).filter((k:string)=>k && !k.toUpperCase().startsWith('KEY'));
    if(OCR_KEYS.length===0) return NextResponse.json({ error: 'OCR_SPACE_API_KEYS kosong' }, { status: 500 });
    for(let key of OCR_KEYS){
      try{
        const form = new FormData();
        // @ts-ignore
        form.append('base64Image', image);
<<<<<<< HEAD
        form.append('language','ind'); form.append('isOverlayRequired','false'); form.append('detectOrientation','true'); form.append('OCREngine','2');
=======
        form.append('language','ind'); form.append('isOverlayRequired','false'); form.append('detectOrientation','true'); form.append('OCREngine','2'); form.append('scale','true'); form.append('isTable','true');
>>>>>>> 715f6c9 (MASYUMI v4.1 FINAL - MASYUMI_KTP_DATA + IFRAME MODE + MM/DD/TTTT pos7-8 -40)
        const res = await fetch('https://api.ocr.space/parse/image', { method:'POST', headers:{ apikey: key }, body: form as any });
        const json = await res.json();
        if(json.OCRExitCode === 3) continue;
        if(json.ParsedResults?.[0]?.ParsedText) return NextResponse.json(json);
      }catch(e){ continue; }
    }
    return NextResponse.json({ error: 'Semua key gagal' }, { status: 500 });
  }catch(e){ return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
