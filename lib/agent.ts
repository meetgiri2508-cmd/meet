export type TranscriptSegment = { start: number; end: number; text: string };
export type Clip = { start: number; end: number; title: string; hookScore: number; reason: string };

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function clean(s:TranscriptSegment[]){return s.filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start&&x.text?.trim()).map(x=>({start:Math.max(0,x.start),end:x.end,text:x.text.trim()}));}

async function aiSelectClips(segments:TranscriptSegment[],count:number):Promise<Clip[]> {
 const key=process.env.OPENAI_API_KEY; if(!key) throw new Error('OPENAI_API_KEY is not configured');
 const transcript=clean(segments).map(s=>`[${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${s.text}`).join('\n');
 const schema={type:'object',additionalProperties:false,properties:{clips:{type:'array',items:{type:'object',additionalProperties:false,properties:{start:{type:'number'},end:{type:'number'},title:{type:'string'},hookScore:{type:'number'},reason:{type:'string'}},required:['start','end','title','hookScore','reason']}}},required:['clips']};
 const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_CLIP_MODEL||'gpt-5.6-luna',input:[{role:'system',content:'Select the strongest short-form video moments from a timestamped transcript. Use only supplied timestamps. Prefer self-contained 15-60 second moments with a strong hook, useful insight, surprise, story beat, or payoff. Avoid overlap and invented facts.'},{role:'user',content:`Select up to ${count} clips. Each must be 15-60 seconds. Return accurate start/end timestamps.\n\n${transcript}`}],text:{format:{type:'json_schema',name:'clip_selection',strict:true,schema}}})});
 const data=await res.json(); if(!res.ok) throw new Error(`OpenAI clip selection failed: ${data?.error?.message||res.statusText}`);
 const text=Array.isArray(data?.output)?data.output.flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text).filter(Boolean).join(''):'';
 if(!text) throw new Error('OpenAI returned no clip selection');
 const parsed=JSON.parse(text), source=clean(segments), clips:Clip[]=[];
 for(const raw of Array.isArray(parsed?.clips)?parsed.clips:[]){
  const start=Number(raw.start),end=Number(raw.end); if(!Number.isFinite(start)||!Number.isFinite(end)||end-start<15||end-start>60) continue;
  const lo=Math.min(...source.map(s=>s.start)),hi=Math.max(...source.map(s=>s.end)); const safeStart=clamp(start,lo,Math.max(lo,hi-15)); const safeEnd=clamp(end,safeStart+15,Math.min(hi,safeStart+60));
  if(clips.some(c=>Math.max(c.start,safeStart)<Math.min(c.end,safeEnd))) continue;
  clips.push({start:Number(safeStart.toFixed(2)),end:Number(safeEnd.toFixed(2)),title:String(raw.title||'Untitled clip').slice(0,100),hookScore:clamp(Number(raw.hookScore)||0,0,100),reason:String(raw.reason||'Strong standalone moment').slice(0,300)});
 }
 return clips.sort((a,b)=>b.hookScore-a.hookScore).slice(0,count);
}

export async function clipAgent(transcript:string,segments?:TranscriptSegment[],count=5):Promise<Clip[]> {
 if(segments?.length&&process.env.OPENAI_API_KEY) return aiSelectClips(segments,Math.min(Math.max(count,1),20));
 const sentences=transcript.split(/(?<=[.!?])\s+/).filter(Boolean); const picks=sentences.map((text,i)=>({text,i,score:Math.min(99,55+(text.length%45))})).sort((a,b)=>b.score-a.score).slice(0,Math.min(count,5));
 return picks.map((p,i)=>({start:i*30,end:i*30+35,title:p.text.slice(0,70),hookScore:p.score,reason:'Development fallback: strong standalone statement / hook'}));
}

export function buildClipPlan(input:{source:string;duration:number;count:number}){return{source:input.source,targetFormat:'9:16',duration:{min:15,max:60},count:Math.min(input.count,20),steps:['transcribe','detect_scenes','score_moments','render_vertical','caption','generate_metadata','queue_publish']};}
