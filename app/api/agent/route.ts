import {NextResponse} from 'next/server';
import {buildClipPlan,clipAgent} from '../../../../lib/agent';
export async function POST(req:Request){
 try { const body=await req.json(); if(!body.source) return NextResponse.json({error:'source is required'},{status:400});
  const plan=buildClipPlan({source:body.source,duration:Number(body.duration||3600),count:Number(body.count||5)});
  const clips=await clipAgent(body.transcript||'');
  return NextResponse.json({ok:true,plan,clips});
 } catch(e){return NextResponse.json({error:'Invalid request'},{status:400});}
}
