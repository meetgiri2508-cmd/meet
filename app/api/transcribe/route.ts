import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 });

    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const form = new FormData();
    form.append('file', file, file.name || 'source.mp4');
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'transcription failed' }, { status: res.status });

    const segments = Array.isArray(data?.segments)
      ? data.segments.map((s: any) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text || '').trim() })).filter((s:any)=>s.text&&s.end>s.start)
      : [];
    return NextResponse.json({ ok: true, text: String(data?.text || ''), segments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'transcription failed' }, { status: 500 });
  }
}
