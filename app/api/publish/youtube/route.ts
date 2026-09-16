import { NextResponse } from 'next/server';
import { uploadToYouTube } from '../../../../../lib/publish/youtube';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const videoUrl = String(body?.videoUrl || '').trim();
    const title = String(body?.title || '').trim();
    const description = String(body?.description || '');
    const privacyStatus = body?.privacyStatus === 'public' || body?.privacyStatus === 'unlisted' ? body.privacyStatus : 'private';
    const accessToken = String(body?.accessToken || process.env.YOUTUBE_ACCESS_TOKEN || '').trim();

    if (!videoUrl || !/^https:\/\//i.test(videoUrl)) return NextResponse.json({ error: 'videoUrl must be an HTTPS URL' }, { status: 400 });
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
    if (!accessToken) return NextResponse.json({ error: 'YouTube OAuth access token is not configured' }, { status: 503 });

    const videoResponse = await fetch(videoUrl, { cache: 'no-store' });
    if (!videoResponse.ok || !videoResponse.body) return NextResponse.json({ error: 'Could not fetch rendered video' }, { status: 502 });
    const video = await videoResponse.blob();
    const result = await uploadToYouTube({ accessToken, video, title, description, privacyStatus });
    return NextResponse.json({ ok: true, videoId: result?.id, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'YouTube publish failed' }, { status: 500 });
  }
}
