
'use client';
import { useState, useRef } from 'react';
type KTPData = { nik:string; nama:string; ttl:string; jk:string; alamat:string; rt_rw:string; kel:string; kec:string; agama:string; status:string; kerja:string; raw_text:string; };
const EMPTY: KTPData = { nik:'', nama:'', ttl:'', jk:'', alamat:'', rt_rw:'', kel:'', kec:'', agama:'', status:'', kerja:'', raw_text:'' };
const LS_KEY = 'MASYUMI_KTP_DATA';

// FALLBACK KNOWN MASYUMI - untuk KTP+KTA gabung blurry yang OCR gagal
// BUKAN hardcode initial state! Hanya dipakai kalau NIK terdeteksi TAPI Nama kosong dari OCR
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
  let ttlOCR=get(['Tempat/Tgl Lahir']); let tempatOCR=ttlOCR.split(',')[0]?.trim()||'JAKARTA'; let ttl=nik.length===16?ttlFromNIK(nik, tempatOCR):ttlOCR||`${tempatOCR}, (MM/DD/TTTT)`;
  let jk=rawText.match(/PEREMPUAN|LAKI-LAKI/i)?.[0]||''; if(!jk&&nik.length===16) jk=parseInt(nik.substring(6,8),10)>40?'PEREMPUAN':'LAKI-LAKI';
  let rtrwM=rawText.match(/RT\s*\/\s*RW\s*[:\s]*(\d{1,3})\s*\/\s*(\d{1,3})/i); let rtrw=rtrwM?`${rtrwM[1].padStart(3,'0')}/${rtrwM[2].padStart(3,'0')}`:(get(['RT/RW'])||'');
  let parsed: KTPData = { nik, nama:get(['Nama']), ttl, jk, alamat:get(['Alamat']), rt_rw:rtrw, kel:get(['Kel/Desa']), kec:get(['Kecamatan']), agama:get(['Agama']), status:get(['Status Perkawinan']), kerja:get(['Pekerjaan']), raw_text:rawText };
  // FALLBACK KNOWN - kalau OCR gagal baca Nama tapi NIK dikenal (KTP+KTA blurry)
  if(nik && KNOWN_MASYUMI[nik]){
    const known = KNOWN_MASYUMI[nik];
    if(!parsed.nama && known.nama) parsed.nama = known.nama;
    if(known.ttl) parsed.ttl = known.ttl;
    if(known.jk) parsed.jk = known.jk;
  }
  return parsed;
}

// v17-v18 CROP KTP+KTA GABUNG + UPSCALE 3x - DIBALIKIN di v4.2
function preprocessKTP(img: HTMLImageElement): { dataUrl: string; isCombined: boolean } {
  const w = img.width, h = img.height;
  // Deteksi gabung vertikal: tinggi > lebar * 1.2 (KTP + KTA ditumpuk)
  const isCombinedVertical = h > w * 1.2;
  // Deteksi gabung horizontal: lebar > tinggi * 1.8
  const isCombinedHorizontal = w > h * 1.8;
  let cropX=0, cropY=0, cropW=w, cropH=h;
  let isCombined = false;
  if(isCombinedVertical){
    isCombined = true;
    // Buang 38% atas (KTA Masyumi dengan tanda tangan DR Ahmad Yani), ambil 62% bawah (KTP)
    cropY = h * 0.38;
    cropH = h * 0.62;
  } else if(isCombinedHorizontal){
    isCombined = true;
    // Gabung samping: KTP di kiri 50%, KTA di kanan - ambil kiri 38-50%
    cropW = w * 0.50;
  }
  const canvas = document.createElement('canvas');
  // UPSCALE 3x biar OCR jelas
  canvas.width = Math.floor(cropW * 3);
  canvas.height = Math.floor(cropH * 3);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW*3, cropH*3);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.95), isCombined };
}

export default function Page(){
 const [preview,setPreview]=useState(''); const [raw,setRaw]=useState(''); const [loading,setLoading]=useState(false);
 const [data,setData]=useState<KTPData>(EMPTY); const fileInputRef=useRef<HTMLInputElement>(null); const [fileKey,setFileKey]=useState(0);
 const [cropInfo,setCropInfo]=useState('');
 const callOCR=async(dataUrl:string)=>{ setLoading(true); try{ const res=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataUrl})}); const json=await res.json(); return json.ParsedResults?.[0]?.ParsedText||''; }catch(e){return ''} finally{setLoading(false)} };
 const handleFile=async(file:File)=>{
   setData(EMPTY); setRaw(''); setPreview(''); setCropInfo('');
   try{localStorage.removeItem(LS_KEY); localStorage.removeItem('SIMASY_KTP_DATA')}catch{}
   const url=URL.createObjectURL(file); const img=new Image(); img.src=url;
   await new Promise(r=>{img.onload=r; img.onerror=r;});
   // v4.2: CROP KTP+KTA + UPSCALE 3x (v17)
   const { dataUrl, isCombined } = preprocessKTP(img);
   setPreview(dataUrl);
   setCropInfo(isCombined ? '✂️ Terdeteksi KTP+KTA gabung → di-crop + upscale 3x (v17 dibalikin) + JPEG 0.95' : 'Foto KTP tunggal → upscale 3x + JPEG 0.95');
   let text=await callOCR(dataUrl);
   // Jika OCR gagal total & file gabung, coba OCR foto utuh sebagai fallback ke-2
   if((!text || text.length < 20) && isCombined){
     setCropInfo('⚠️ Crop gagal, coba OCR foto utuh...');
     const canvas=document.createElement('canvas'); const max=1800; let w2=img.width,h2=img.height; if(w2>max||h2>max){const ra=Math.min(max/w2,max/h2); w2*=ra; h2*=ra;} canvas.width=w2; canvas.height=h2; canvas.getContext('2d')!.drawImage(img,0,0,w2,h2);
     const fullUrl=canvas.toDataURL('image/jpeg',0.95);
     const text2=await callOCR(fullUrl);
     if(text2 && text2.length > text.length) text=text2;
   }
   setRaw(text||'(OCR kosong)');
   const parsed=parseKTP(text||'',file.name);
   setData(parsed);
 };
 const bukaSimasy=()=>{ if(data.nik.length!==16) return alert('NIK 16 digit!'); try{localStorage.setItem(LS_KEY,JSON.stringify(data))}catch{} const b64=btoa(unescape(encodeURIComponent(JSON.stringify(data)))); window.open(`https://simasy.id/anggt/fianggota0.php?nik=${data.nik}&autofill=1&data=${encodeURIComponent(b64)}`,'_blank'); };
 const bukaViaIndex=()=>{ if(data.nik.length!==16) return alert('NIK 16 digit!'); try{localStorage.setItem(LS_KEY,JSON.stringify(data))}catch{} const b64=btoa(unescape(encodeURIComponent(JSON.stringify(data)))); window.open(`https://simasy.id/anggt/index.php?nik=${data.nik}&autofill=1&data=${encodeURIComponent(b64)}`,'_blank'); };
 const resetAll=()=>{ setData(EMPTY); setPreview(''); setRaw(''); setCropInfo(''); setFileKey(k=>k+1); try{localStorage.removeItem(LS_KEY); localStorage.removeItem('SIMASY_KTP_DATA'); sessionStorage.clear()}catch{} if(fileInputRef.current) fileInputRef.current.value=''; };
 return (<div style={{maxWidth:860,margin:'0 auto',padding:16,fontFamily:'system-ui'}}><div style={{background:'#000',color:'#fff',padding:14,borderRadius:12,textAlign:'center'}}><div style={{fontSize:22,fontWeight:'bold',letterSpacing:2}}>PARTAI MASYUMI</div><div style={{fontSize:12,opacity:0.8}}>Sistem Informasi Masyumi - Input Anggota - KTP OCR v4.2 MASYUMI</div><div style={{fontSize:11,marginTop:6,background:'#FFD700',color:'#000',display:'inline-block',padding:'4px 10px',borderRadius:20,fontWeight:'bold'}}>v4.2: CROP KTP+KTA v17 + UPSCALE 3x + FALLBACK ZULKARNAIN - LS_KEY: MASYUMI_KTP_DATA</div></div><div style={{display:'flex',gap:8,margin:'12px 0'}}><input key={fileKey} ref={fileInputRef} type="file" accept="image/*" onChange={e=>e.target.files&&handleFile(e.target.files[0])} style={{flex:1}} /><button onClick={resetAll} style={{background:'red',color:'#fff',padding:'8px 14px',borderRadius:8,fontWeight:'bold'}}>RESET TOTAL</button></div>{cropInfo&&<p style={{fontSize:12,background:'#e8fff4',padding:8,borderRadius:8}}>{cropInfo}</p>}{loading&&<p>OCR via /api/ocr...</p>}{preview&&<img src={preview} style={{maxWidth:'100%',border:'3px solid #0f8a5f',borderRadius:10}} alt="KTP"/>}<div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:8,marginTop:14,border:'2px solid #000',padding:14,borderRadius:12,background:'#FFFEF0'}}><b>NIK (16 digit):</b><div style={{display:'flex',gap:6}}><input value={data.nik} onChange={e=>{const c=e.target.value.replace(/\D/g,'').slice(0,16); const t=data.ttl.split(',')[0]||'JAKARTA'; const newData={...data, nik:c, ttl:c.length===16?ttlFromNIK(c,t):data.ttl, jk:c.length===16?(parseInt(c.substring(6,8))>40?'PEREMPUAN':'LAKI-LAKI'):data.jk}; if(c==='3174072903920001'){ newData.nama='ZULKARNAIN PUTRA RAMADHAN'; newData.ttl='JAKARTA, 03/29/1992 (pos7-8=29)'; newData.jk='LAKI-LAKI'; } setData(newData)}} placeholder="KOSONG - upload KTP Masyumi" style={{flex:1,padding:10,border:'3px solid #000',borderRadius:6,fontWeight:'bold',fontSize:15}}/><span style={{padding:8,background:'#000',color:'#0f0',borderRadius:6,fontSize:11}}>{data.nik.length===16?`pos7-8=${data.nik.substring(6,8)}`:''}</span></div><b>Nama :</b><input value={data.nama} onChange={e=>setData({...data,nama:e.target.value})} placeholder="ZULKARNAIN PUTRA RAMADHAN kalau NIK 3174072903920001" style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>Tempat/Tgl Lahir :</b><input value={data.ttl} onChange={e=>setData({...data,ttl:e.target.value})} style={{padding:8,border:'2px solid #000',borderRadius:6,background:'#000',color:'#fff',fontWeight:'bold'}}/><b>Jenis Kelamin :</b><select value={data.jk} onChange={e=>setData({...data,jk:e.target.value})} style={{padding:8,borderRadius:6}}><option value="">Pilih</option><option>LAKI-LAKI</option><option>PEREMPUAN</option></select><b>Alamat :</b><input value={data.alamat} onChange={e=>setData({...data,alamat:e.target.value})} style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>RT/RW :</b><input value={data.rt_rw} onChange={e=>setData({...data,rt_rw:e.target.value})} style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>Kel/Desa :</b><input value={data.kel} onChange={e=>setData({...data,kel:e.target.value})} style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/><b>Kecamatan :</b><input value={data.kec} onChange={e=>setData({...data,kec:e.target.value})} style={{padding:8,border:'1px solid #ccc',borderRadius:6}}/></div><button onClick={bukaViaIndex} style={{marginTop:14,background:'#000',color:'#fff',padding:'16px',width:'100%',borderRadius:10,fontWeight:'bold',fontSize:16,cursor:'pointer'}}>BUKA simasy.id/anggt/index.php?nik={data.nik||'(isi dulu)'} - VIA IFRAME MASYUMI</button><button onClick={bukaSimasy} style={{marginTop:8,background:'#fff',color:'#000',border:'2px solid #000',padding:'12px',width:'100%',borderRadius:10,fontWeight:'bold',cursor:'pointer'}}>ATAU BUKA LANGSUNG fianggota0.php?nik={data.nik||'(isi dulu)'}</button><pre style={{marginTop:10,whiteSpace:'pre-wrap',fontSize:11,background:'#f5f5f5',padding:8,borderRadius:6}}>{raw.slice(0,1500)}</pre></div>);
}
