import { NextResponse } from 'next/server';
import { buildClipPlan, clipAgent, generateClipMetadata, TranscriptSegment } from '../../../../lib/agent';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function transcribe(file: File) {
 const key=process.env.OPENAI_API_KEY; if(!key) throw new Error('OPENAI_API_KEY is not configured');
 const form=new FormData(); form.append('file',file,file.name||'source.mp4'); form.append('model',process.env.OPENAI_TRANSCRIBE_MODEL||'whisper-1'); form.append('response_format','verbose_json'); form.append('timestamp_granularities[]','segment');
 const res=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form}); const data=await res.json(); if(!res.ok) throw new Error(data?.error?.message||'transcription failed');
 const segments:TranscriptSegment[]=Array.isArray(data?.segments)?data.segments.map((s:any)=>({start:Number(s.start),end:Number(s.end),text:String(s.text||'').trim()})).filter((s:TranscriptSegment)=>s.text&&s.end>s.start):[];
 return {text:String(data?.text||''),segments};
}

export async function POST(req:Request){
 try{
  const contentType=req.headers.get('content-type')||''; let source='',transcript='',segments:TranscriptSegment[]=[]; let count=5;
  if(contentType.includes('multipart/form-data')){
   const form=await req.formData(); source=String(form.get('source')||'uploaded-video'); count=Math.min(20,Math.max(1,Number(form.get('count')||5)));
   const file=form.get('file'); if(!(file instanceof File)) return NextResponse.json({error:'file is required'},{status:400});
   const result=await transcribe(file); transcript=result.text; segments=result.segments;
  }else{
   const body=await req.json(); source=String(body.source||''); transcript=String(body.transcript||''); segments=Array.isArray(body.segments)?body.segments:[]; count=Math.min(20,Math.max(1,Number(body.count||5)));
  }
  if(!source) return NextResponse.json({error:'source is required'},{status:400});
  if(!transcript) return NextResponse.json({error:'transcript is required (or upload an audio/video file)'},{status:400});
  const duration=segments.length?Math.max(...segments.map(s=>Number(s.end)||0)):3600;
  const plan=buildClipPlan({source,duration,count});
  const clips=await clipAgent(transcript,segments,count);
  const enriched=process.env.OPENAI_API_KEY?await Promise.all(clips.map(async clip=>({...clip,...await generateClipMetadata(clip,transcript)}))):clips;
  return NextResponse.json({ok:true,plan,transcript,segments,clips:enriched});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Agent failed'},{status:500});}
}
