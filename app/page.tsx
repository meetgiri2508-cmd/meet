'use client';
import {useState} from 'react';

type Segment={start:number;end:number;text:string};
type Clip={start:number;end:number;title:string;hookScore:number;reason:string;caption?:string;outputUrl?:string;rendering?:boolean};

export default function Home(){
 const [source,setSource]=useState(''); const [transcript,setTranscript]=useState(''); const [segments,setSegments]=useState<Segment[]>([]); const [file,setFile]=useState<File|null>(null); const [status,setStatus]=useState(''); const [clips,setClips]=useState<Clip[]>([]); const [busy,setBusy]=useState(false);
 async function uploadSource(){
  if(!file) return source;
  setStatus('Uploading source directly to R2…');
  const meta=await fetch('/api/source/upload-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,contentType:file.type,size:file.size})});
  const data=await meta.json(); if(!meta.ok) throw new Error(data.error||'Could not prepare upload');
  const put=await fetch(data.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type},body:file});
  if(!put.ok) throw new Error('R2 upload failed');
  return data.sourceUrl as string;
 }
 async function run(){
  if(!source.trim()&&!file){setStatus('Add a video URL or upload a video first.');return;}
  setBusy(true); setClips([]); setSegments([]);
  try{
   const resolvedSource=await uploadSource(); setSource(resolvedSource);
   setStatus('AI is transcribing and analyzing the source…');
   let r:Response;
   if(file){
    const form=new FormData(); form.append('source',resolvedSource); form.append('count','5'); form.append('file',file); r=await fetch('/api/agent',{method:'POST',body:form});
   }else{
    r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:resolvedSource,transcript,count:5})});
   }
   const data=await r.json(); if(!r.ok) throw new Error(data.error||'Agent failed');
   setSegments(Array.isArray(data.segments)?data.segments:[]); setClips(data.clips||[]); setStatus(`${data.clips?.length||0} clip candidates generated. Render the ones you want.`);
  }catch(e){setStatus(e instanceof Error?e.message:'Agent failed.');} finally{setBusy(false);}
 }
 async function renderClip(index:number){
  const clip=clips[index];
  setClips(prev=>prev.map((c,i)=>i===index?{...c,rendering:true}:c)); setStatus(`Rendering clip ${index+1} with captions…`);
  try{
   const r=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceUrl:source,start:clip.start,end:clip.end,segments,captions:true})});
   const data=await r.json(); if(!r.ok) throw new Error(data.error||'Render failed');
   setClips(prev=>prev.map((c,i)=>i===index?{...c,outputUrl:data.outputUrl,rendering:false}:c)); setStatus(`Clip ${index+1} rendered with captions successfully.`);
  }catch(e){setClips(prev=>prev.map((c,i)=>i===index?{...c,rendering:false}:c)); setStatus(e instanceof Error?e.message:'Render failed.');}
 }
 return <main style={{minHeight:'100vh',padding:'48px 24px',fontFamily:'system-ui',background:'linear-gradient(135deg,#080b16,#17102b)',color:'#fff'}}><div style={{maxWidth:1100,margin:'auto'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><p style={{letterSpacing:3,opacity:.7,fontWeight:800}}>CLIPFORGE AI</p><span style={{padding:'7px 11px',border:'1px solid #ffffff22',borderRadius:999,fontSize:12}}>AUTONOMOUS CONTENT AGENT</span></div>
  <h1 style={{fontSize:'clamp(40px,7vw,72px)',lineHeight:1.02,margin:'30px 0 14px'}}>One long video.<br/>A whole short-form pipeline.</h1>
  <p style={{fontSize:19,opacity:.72,maxWidth:720}}>Upload authorized long-form content or provide a direct video URL. The agent finds moments, burns in captions, renders vertical clips and stores finished MP4s in R2.</p>
  <section style={{marginTop:36,padding:24,border:'1px solid #ffffff18',borderRadius:24,background:'#ffffff08'}}>
   <label style={{display:'block',fontWeight:700}}>Video source</label><div style={{display:'flex',gap:12,marginTop:12,flexWrap:'wrap'}}><input value={source} onChange={e=>setSource(e.target.value)} placeholder='https://…/video.mp4' style={{flex:'1 1 500px',padding:16,borderRadius:12,border:'1px solid #ffffff20',background:'#070914',color:'#fff',fontSize:15}}/><button disabled={busy} onClick={run} style={{padding:'14px 24px',border:0,borderRadius:12,fontWeight:800,opacity:busy?.6:1}}>{busy?'Running agent…':'Create clips'}</button></div>
   <div style={{marginTop:14}}><input type='file' accept='video/*' onChange={e=>setFile(e.target.files?.[0]||null)}/>{file&&<span style={{marginLeft:10,opacity:.7,fontSize:13}}>{file.name}</span>}</div>
   <details style={{marginTop:16,opacity:.8}}><summary>Optional transcript (URL mode)</summary><textarea value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder='Paste a transcript to let the agent select clips without transcription.' style={{width:'100%',minHeight:120,marginTop:10,padding:14,borderRadius:12,background:'#070914',color:'#fff',border:'1px solid #ffffff20'}}/></details><p style={{opacity:.65,minHeight:22}}>{status}</p>
  </section>
  {clips.length>0&&<><h2 style={{marginTop:36}}>AI-selected moments</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:16,marginTop:14}}>{clips.map((c,i)=><article key={`${c.start}-${i}`} style={{padding:20,borderRadius:18,border:'1px solid #ffffff18',background:'#ffffff08'}}>{c.outputUrl?<video src={c.outputUrl} controls playsInline style={{width:'100%',height:260,objectFit:'cover',borderRadius:14,background:'#080a12'}}/>:<div style={{height:150,borderRadius:14,background:'linear-gradient(160deg,#292d4a,#080a12)',display:'grid',placeItems:'center',fontSize:34}}>▶</div>}<h3>{c.title}</h3><small>{Math.round(c.start)}s–{Math.round(c.end)}s • Hook score {c.hookScore}/100</small><p style={{opacity:.68,fontSize:14}}>{c.reason}</p>{c.outputUrl?<a href={c.outputUrl} target='_blank' rel='noreferrer' style={{display:'inline-block',marginTop:8,padding:'10px 13px',borderRadius:10,border:'1px solid #ffffff22',color:'#fff',textDecoration:'none'}}>Open MP4</a>:<button disabled={c.rendering} onClick={()=>renderClip(i)} style={{marginTop:8,padding:'10px 13px',borderRadius:10,border:'1px solid #ffffff22',background:'transparent',color:'#fff'}}>{c.rendering?'Rendering…':'Render + captions'}</button>}</article>)}</div></>}
  <section style={{marginTop:40,display:'flex',gap:10,flexWrap:'wrap',opacity:.75}}>{['AI clip selection','R2 source storage','9:16 rendering','Auto captions','Video previews','YouTube Shorts','TikTok','Analytics learning'].map(x=><span key={x} style={{padding:'8px 12px',border:'1px solid #ffffff18',borderRadius:999}}>{x}</span>)}</section>
 </div></main>
}
