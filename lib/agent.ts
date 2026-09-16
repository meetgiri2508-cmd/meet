export type Clip = {start:number; end:number; title:string; hookScore:number; reason:string};

export async function clipAgent(transcript:string):Promise<Clip[]> {
  // Production version: replace this deterministic fallback with the LLM provider.
  const sentences=transcript.split(/(?<=[.!?])\s+/).filter(Boolean);
  const picks=sentences.map((text,i)=>({text,i,score:Math.min(99,55+(text.length%45))})).sort((a,b)=>b.score-a.score).slice(0,5);
  return picks.map((p,i)=>({start:i*30,end:i*30+35,title:p.text.slice(0,70),hookScore:p.score,reason:'Strong standalone statement / hook'}));
}

export function buildClipPlan(input:{source:string; duration:number; count:number}) {
 return {source:input.source, targetFormat:'9:16', duration:{min:15,max:60}, count:Math.min(input.count,20), steps:['transcribe','detect_scenes','score_moments','render_vertical','caption','generate_metadata','queue_publish']};
}
