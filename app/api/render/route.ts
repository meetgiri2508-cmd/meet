import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RenderRequest = {
  sourceUrl: string;
  start: number;
  end: number;
};

export async function POST(req: Request) {
  try {
    const workerUrl = process.env.WORKER_URL?.replace(/\/$/, '');
    if (!workerUrl) {
      return NextResponse.json({ error: 'WORKER_URL is not configured' }, { status: 503 });
    }

    const body = (await req.json()) as Partial<RenderRequest>;
    const sourceUrl = String(body.sourceUrl || '').trim();
    const start = Number(body.start);
    const end = Number(body.end);

    if (!sourceUrl || !Number.isFinite(start) || !Number.isFinite(end)) {
      return NextResponse.json({ error: 'sourceUrl, start and end are required' }, { status: 400 });
    }
    if (!/^https:\/\//i.test(sourceUrl)) {
      return NextResponse.json({ error: 'sourceUrl must be an HTTPS URL' }, { status: 400 });
    }
    if (end <= start || end - start < 15 || end - start > 60) {
      return NextResponse.json({ error: 'clip must be between 15 and 60 seconds' }, { status: 400 });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.WORKER_SECRET) headers.Authorization = `Bearer ${process.env.WORKER_SECRET}`;

    const response = await fetch(`${workerUrl}/render`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sourceUrl, start, end }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || 'Worker render failed' },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Render request failed' },
      { status: 500 },
    );
  }
}
