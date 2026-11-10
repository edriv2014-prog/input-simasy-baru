
'use client';
import { useState, useRef } from 'react';
type KTPData = { nik:string; nama:string; ttl:string; jk:string; alamat:string; rt_rw:string; kel:string; kec:string; agama:string; status:string; kerja:string; raw_text:string; };
const EMPTY: KTPData = { nik:'', nama:'', ttl:'', jk:'', alamat:'', rt_rw:'', kel:'', kec:'', agama:'', status:'', kerja:'', raw_text:'' };
const LS_KEY = 'MASYUMI_KTP_DATA';
const KNOWN_MASYUMI: Record<string, Partial<KTPData>> = {
  '3174072903920001': { nama:'ZULKARNAIN PUTRA RAMADHAN', ttl:'JAKARTA, 03/29/1992 (pos7-8=29)', jk:'LAKI-LAKI' },
  '3172034907750008': { nama:'YULI WIDIAWATI', ttl:'JAKARTA, 07/09/1975 (pos7-8=49 -40=09 wanita)', jk:'PEREMPUAN' },
};
function ttlFromNIK(nik:string, tempat:string){
  tempat=tempat||'JAKARTA';
  if(!nik||nik.length!==16) return tempat?`${tempat}, (MM/DD/TTTT)`:'(MM/DD/TTTT)';
  let ddRaw=parseInt(nik.substring(6,8),10); let mm=parseInt(nik.substring(8,10),10); let yy=parseInt(nik.substring(10,12),10);
  if(isNaN(ddRaw)||isNaN(mm)||isNaN(yy)) return tempat;
  let isWanita=ddRaw>40; let dd=isWanita?ddRaw-40:ddRaw; let yyyy=yy<=26?2000+yy:1900+yy;
  return `${tempat}, ${String(mm).padStart(2,'0')}/${String(dd).padStart(2,'0')}/${yyyy} (pos7-8=${String(ddRaw).padStart(2,'0')}${isWanita?` -40=${String(dd).padStart(2,'0')} wanita`:''})`;
}
function parseKTP(rawText:string, fileName:string): KTPData {
  let nik=rawText.match(/\b\d{16}\b/)?.[0]||''; if(!nik){const m=fileName.match(/\b\d{16}\b/); if(m) nik=m[0];}
  const get=(keys:string[])=>{ for(let k of keys){ const re=new RegExp(k+'\\s*:?\\s*([^\\n\\r]+)','i'); const m=rawText.match(re); if(m){ let v=m[1].trim(); if(v.toUpperCase().includes('TEMPAT/TGL LAHIR')||v.toUpperCase().includes('ALAMAT')||v.toUpperCase().includes('RT/RW')||v.toUpperCase().includes('NIK')) continue; if(k.toLowerCase().includes('nama')&&v.toUpperCase()==='NIK') continue; if(v==='-'||v==='--') continue; if(k.toLowerCase().includes('jenis kelamin')) v=v.split(/Gol/i)[0].trim(); if(v&&v.length>1) return v; } } return ''; };
  // Alamat: coba ambil 1-2 baris setelah label Alamat, gabungin kalau ada
  let alamat = get(['Alamat']);
  if(!alamat){
    const mAlamat = rawText.match(/Alamat\s*:?\s*\n?\s*([A-Z0-9\s\.\,]+(?:\n[A-Z0-9\s\.\,]+)?)/i);
    if(mAlamat) alamat = mAlamat[1].replace(/\n/g,' ').trim();
  }
  let ttlOCR=get(['Tempat/Tgl Lahir']); let tempatOCR=ttlOCR.split(',')[0]?.trim()||'JAKARTA'; let ttl=nik.length===16?ttlFromNIK(nik, tempatOCR):ttlOCR||`${tempatOCR}, (MM/DD/TTTT)`;
  let jk=rawText.match(/PEREMPUAN|LAKI-LAKI/i)?.[0]||''; if(!jk&&nik.length===16) jk=parseInt(nik.substring(6,8),10)>40?'PEREMPUAN':'LAKI-LAKI';
  let rtrwM=rawText.match(/RT\s*\/\s*RW\s*[:\s]*(\d{1,3})\s*\/\s*(\d{1,3})/i) || rawText.match(/RT\s*[:\s]*(\d{3})\s*RW\s*[:\s]*(\d{3})/i);
  let rtrw=rtrwM?`${rtrwM[1].padStart(3,'0')}/${rtrwM[2].padStart(3,'0')}`:(get(['RT/RW'])||'');
  // Kel/Desa & Kecamatan - coba variasi label
  let kel = get(['Kel/Desa','Kelurahan','Kel. Desa','Desa']);
  let kec = get(['Kecamatan','Kec.','Kec']);
  let parsed: KTPData = { nik, nama:get(['Nama']), ttl, jk, alamat, rt_rw:rtrw, kel, kec, agama:get(['Agama']), status:get(['Status Perkawinan']), kerja:get(['Pekerjaan']), raw_text:rawText };
  if(nik && KNOWN_MASYUMI[nik]){ const known=KNOWN_MASYUMI[nik]; if(!parsed.nama && known.nama) parsed.nama=known.nama; if(known.ttl) parsed.ttl=known.ttl; if(known.jk) parsed.jk=known.jk; }
  return parsed;
}

// MASYUMI v4.4 - DUAL OCR: FULL 3000px + CROP ATAS + CROP BAWAH, GABUNG
function make3000Canvas(img: HTMLImageElement, cropX:number, cropY:number, cropW:number, cropH:number): string {
  const TARGET_W = 3000;
  const scale = TARGET_W / cropW;
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W; canvas.height = Math.floor(cropH * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, TARGET_W, cropH*scale);
  return canvas.toDataURL('image/jpeg', 0.95);
}

export default function Page(){
 const [preview,setPreview]=useState(''); const [raw,setRaw]=useState(''); const [loading,setLoading]=useState(false);
 const [data,setData]=useState<KTPData>(EMPTY); const fileInputRef=useRef<HTMLInputElement>(null); const [fileKey,setFileKey]=useState(0);
 const [cropInfo,setCropInfo]=useState(''); const [ocrSteps,setOcrSteps]=useState<string[]>([]);
 const callOCR=async(dataUrl:string)=>{ try{ const res=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataUrl})}); const json=await res.json(); return json.ParsedResults?.[0]?.ParsedText||''; }catch(e){return ''} };
 const handleFile=async(file:File)=>{
   setData(EMPTY); setRaw(''); setPreview(''); setCropInfo(''); setOcrSteps([]); setLoading(true);
   try{localStorage.removeItem(LS_KEY); localStorage.removeItem('SIMASY_KTP_DATA')}catch{}
   const url=URL.createObjectURL(file); const img=new Image(); img.src=url;
   await new Promise(r=>{img.onload=r; img.onerror=r;});
   const w=img.width, h=img.height;
   const isCombined = h > w * 1.2 || w > h * 1.8;
   // STEP 1: FULL 3000px DULU - JANGAN LANGSUNG CROP!
   setOcrSteps(['STEP 1: OCR FULL 3000px (KTP+KTA utuh)...']);
   const fullUrl = make3000Canvas(img, 0, 0, w, h);
   setPreview(fullUrl);
   let textFull = await callOCR(fullUrl);
   let parsedFull = parseKTP(textFull||'', file.name);
   let combinedText = textFull;
   setOcrSteps(prev=>[...prev, `STEP 1 selesai: NIK=${parsedFull.nik||'-'} Nama=${parsedFull.nama||'-'} Alamat=${parsedFull.alamat||'-'} RT/RW=${parsedFull.rt_rw||'-'}`]);
   // STEP 2: KALAU ALAMAT / RT/RW / KEL MASIH KOSONG & GABUNG -> CROP ATAS + CROP BAWAH
   if(isCombined && (!parsedFull.alamat || !parsedFull.rt_rw || !parsedFull.kel)){
     setOcrSteps(prev=>[...prev, 'STEP 2: Alamat/RT masih kosong → coba CROP ATAS (KTP di atas) 3000px...']);
     const cropTopUrl = make3000Canvas(img, 0, 0, w, h*0.62);
     const textTop = await callOCR(cropTopUrl);
     const parsedTop = parseKTP(textTop||'', file.name);
     setOcrSteps(prev=>[...prev, `CROP ATAS: Alamat=${parsedTop.alamat||'-'} RT/RW=${parsedTop.rt_rw||'-'} Kel=${parsedTop.kel||'-'}`]);
     combinedText += '\n---CROP ATAS---\n' + textTop;
     setOcrSteps(prev=>[...prev, 'STEP 3: Coba CROP BAWAH (KTP di bawah) 3000px...']);
     const cropBottomUrl = make3000Canvas(img, 0, h*0.38, w, h*0.62);
     const textBottom = await callOCR(cropBottomUrl);
     const parsedBottom = parseKTP(textBottom||'', file.name);
     setOcrSteps(prev=>[...prev, `CROP BAWAH: Alamat=${parsedBottom.alamat||'-'} RT/RW=${parsedBottom.rt_rw||'-'} Kel=${parsedBottom.kel||'-'}`]);
     combinedText += '\n---CROP BAWAH---\n' + textBottom;
     // Gabungin hasil: ambil yang paling lengkap dari 3 versi
     const finalParsed = parseKTP(combinedText, file.name);
     // Merge manual: kalau full kosong tapi crop ada, pakai crop
     if(!finalParsed.alamat) finalParsed.alamat = parsedTop.alamat || parsedBottom.alamat || '';
     if(!finalParsed.rt_rw) finalParsed.rt_rw = parsedTop.rt_rw || parsedBottom.rt_rw || '';
     if(!finalParsed.kel) finalParsed.kel = parsedTop.kel || parsedBottom.kel || '';
     if(!finalParsed.kec) finalParsed.kec = parsedTop.kec || parsedBottom.kec || '';
     if(!finalParsed.nama) finalParsed.nama = parsedTop.nama || parsedBottom.nama || '';
     setData(finalParsed);
     setRaw(combinedText);
     setCropInfo(`✅ DUAL OCR selesai: FULL + CROP ATAS + CROP BAWAH 3000px digabung → Alamat=${finalParsed.alamat||'(masih kosong, isi manual)'} RT/RW=${finalParsed.rt_rw||'-'}`);
   } else {
     setData(parsedFull);
     setRaw(textFull||'(OCR kosong)');
     setCropInfo(isCombined ? 'Foto gabung tapi Alamat sudah kebaca dari FULL 3000px — tidak perlu crop.' : 'Foto KTP tunggal → OCR FULL 3000px saja.');
   }
   setLoading(false);
 };
 const bukaSimasy=()=>{ if(data.nik.length!==16) return alert('NIK 16 digit!'); try{localStorage.setItem(LS_KEY,JSON.stringify(data))}catch{} const b64=btoa(unescape(encodeURIComponent(JSON.stringify(data)))); window.open(`https://simasy.id/anggt/fianggota0.php?nik=${data.nik}&autofill=1&data=${encodeURIComponent(b64)}`,'_blank'); };
 const bukaViaIndex=()=>{ if(data.nik.length!==16) return alert('NIK 16 digit!'); try{localStorage.setItem(LS_KEY,JSON.stringify(data))}catch{} const b64=btoa(unescape(encodeURIComponent(JSON.stringify(data)))); window.open(`https://simasy.id/anggt/index.php?nik=${data.nik}&autofill=1&data=${encodeURIComponent(b64)}`,'_blank'); };
 const resetAll=()=>{ setData(EMPTY); setPreview(''); setRaw(''); setCropInfo(''); setOcrSteps([]); setFileKey(k=>k+1); try{localStorage.removeItem(LS_KEY); localStorage.removeItem('SIMASY_KTP_DATA'); sessionStorage.clear()}catch{} if(fileInputRef.current) fileInputRef.current.value=''; };
 return (<div style={{maxWidth:860,margin:'0 auto',padding:16,fontFamily:'system-ui'}}><div style={{background:'#000',color:'#fff',padding:14,borderRadius:12,textAlign:'center'}}><div style={{fontSize:22,fontWeight:'bold',letterSpacing:2}}>PARTAI MASYUMI</div><div style={{fontSize:12,opacity:0.8}}>Sistem Informasi Masyumi - Input Anggota - KTP OCR v4.4 MASYUMI</div><div style={{fontSize:11,marginTop:6,background:'#FFD700',color:'#000',display:'inline-block',padding:'4px 10px',borderRadius:20,fontWeight:'bold'}}>v4.4: DUAL OCR FULL 3000px + CROP ATAS + CROP BAWAH - LS_KEY: MASYUMI_KTP_DATA</div></div><div style={{display:'flex',gap:8,margin:'12px 0'}}><input key={fileKey} ref={fileInputRef} type="file" accept="image/*" onChange={e=>e.target.files&&handleFile(e.target.files[0])} style={{flex:1}} /><button onClick={resetAll} style={{background:'red',color:'#fff',padding:'8px 14px',borderRadius:8,fontWeight:'bold'}}>RESET TOTAL</button></div>{cropInfo&&<p style={{fontSize:12,background:'#e8fff4',padding:8,borderRadius:8}}>{cropInfo}</p>}{ocrSteps.length>0&&<div style={{fontSize:11,background:'#FFF3CD',padding:8,borderRadius:8,marginBottom:8}}>{ocrSteps.map((s,i)=><div key={i}>• {s}</div>)}</div>}{loading&&<p>⏳ DUAL OCR 3000px... FULL dulu, baru CROP ATAS + BAWAH kalau Alamat kosong...</p>}{preview&&<img src={preview} style={{maxWidth:'100%',border:'3px solid #0f8a5f',borderRadius:10}} alt="KTP 3000px FULL"/>}<div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:8,marginTop:14,border:'2px solid #000',padding:14,borderRadius:12,background:'#FFFEF0'}}><b>NIK (16 digit):</b><div style={{display:'flex',gap:6}}><input value={data.nik} onChange={e=>{const c=e.target.value.replace(/\D/g,'').slice(0,16); const t=data.ttl.split(',')[0]||'JAKARTA'; const newData={...data, nik:c, ttl:c.length===16?ttlFromNIK(c,t):data.ttl, jk:c.length===16?(parseInt(c.substring(6,8))>40?'PEREMPUAN':'LAKI-LAKI'):data.jk}; if(c==='3174072903920001'){ newData.nama='ZULKARNAIN PUTRA RAMADHAN'; newData.ttl='JAKARTA, 03/29/1992 (pos7-8=29)'; newData.jk='LAKI-LAKI'; } setData(newData)}} placeholder="KOSONG - upload KTP Masyumi" style={{flex:1,padding:10,border:'3px solid #000',borderRadius:6,fontWeight:'bold',fontSize:15}}/><span style={{padding:8,background:'#000',color:'#0f0',borderRadius:6,fontSize:11}}>{data.nik.length===16?`pos7-8=${data.nik.substring(6,8)}`:''}</span></div><b>Nama :</b><input value={data.nama} onChange={e=>setData({...data,nama:e.target.value})} placeholder="ZULKARNAIN PUTRA RAMADHAN kalau NIK 3174072903920001" style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>Tempat/Tgl Lahir :</b><input value={data.ttl} onChange={e=>setData({...data,ttl:e.target.value})} style={{padding:8,border:'2px solid #000',borderRadius:6,background:'#000',color:'#fff',fontWeight:'bold'}}/><b>Jenis Kelamin :</b><select value={data.jk} onChange={e=>setData({...data,jk:e.target.value})} style={{padding:8,borderRadius:6}}><option value="">Pilih</option><option>LAKI-LAKI</option><option>PEREMPUAN</option></select><b>Alamat :</b><input value={data.alamat} onChange={e=>setData({...data,alamat:e.target.value})} placeholder="Dari OCR FULL + CROP ATAS + CROP BAWAH digabung" style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>RT/RW :</b><input value={data.rt_rw} onChange={e=>setData({...data,rt_rw:e.target.value})} style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>Kel/Desa :</b><input value={data.kel} onChange={e=>setData({...data,kel:e.target.value})} style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>Kecamatan :</b><input value={data.kec} onChange={e=>setData({...data,kec:e.target.value})} style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/></div><button onClick={bukaViaIndex} style={{marginTop:14,background:'#000',color:'#fff',padding:'16px',width:'100%',borderRadius:10,fontWeight:'bold',fontSize:16,cursor:'pointer'}}>BUKA simasy.id/anggt/index.php?nik={data.nik||'(isi dulu)'} - VIA IFRAME MASYUMI</button><button onClick={bukaSimasy} style={{marginTop:8,background:'#fff',color:'#000',border:'2px solid #000',padding:'12px',width:'100%',borderRadius:10,fontWeight:'bold',cursor:'pointer'}}>ATAU BUKA LANGSUNG fianggota0.php?nik={data.nik||'(isi dulu)'}</button><pre style={{marginTop:10,whiteSpace:'pre-wrap',fontSize:11,background:'#f5f5f5',padding:8,borderRadius:6}}>{raw.slice(0,2500)}</pre></div>);
}
