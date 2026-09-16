import { NextResponse } from 'next/server';
import { buildClipPlan } from '../../../../lib/agent';
import { selectClips, transcribeAudio } from '../../../../lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let source = '';
    let transcript = '';
    let count = 5;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      source = String(form.get('source') || 'uploaded-video');
      count = Number(form.get('count') || 5);
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'file is required for multipart requests' }, { status: 400 });
      }
      transcript = await transcribeAudio(file);
    } else {
      const body = await req.json();
      source = String(body.source || '');
      transcript = String(body.transcript || '');
      count = Number(body.count || 5);
    }

    if (!source) return NextResponse.json({ error: 'source is required' }, { status: 400 });
    if (!transcript) return NextResponse.json({ error: 'transcript is required (or upload an audio/video file)' }, { status: 400 });

    const plan = buildClipPlan({ source, duration: Number(3600), count });
    const clips = await selectClips(transcript, count);
    return NextResponse.json({ ok: true, plan, clips });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
