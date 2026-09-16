import { NextResponse } from 'next/server';
import { directPostTikTok, getTikTokCreatorInfo } from '../../../../../lib/publish/tiktok';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const accessToken = String(body?.accessToken || process.env.TIKTOK_ACCESS_TOKEN || '').trim();
    const videoUrl = String(body?.videoUrl || '').trim();
    const title = String(body?.title || '').trim();
    const privacyLevel = String(body?.privacyLevel || '').trim();

    if (!accessToken) return NextResponse.json({ error: 'TikTok OAuth access token is not configured' }, { status: 503 });
    if (!videoUrl || !/^https:\/\//i.test(videoUrl)) return NextResponse.json({ error: 'videoUrl must be an HTTPS URL' }, { status: 400 });
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    const creator = await getTikTokCreatorInfo(accessToken);
    const allowed = creator?.data?.privacy_level_options || [];
    const selectedPrivacy = privacyLevel || allowed[0];
    if (!selectedPrivacy || (allowed.length && !allowed.includes(selectedPrivacy))) {
      return NextResponse.json({ error: 'Invalid TikTok privacy level', privacyLevelOptions: allowed }, { status: 400 });
    }

    const result = await directPostTikTok({ accessToken, videoUrl, title, privacyLevel: selectedPrivacy, isAigc: true });
    return NextResponse.json({ ok: true, publishId: result?.data?.publish_id, privacyLevel: selectedPrivacy, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'TikTok publish failed' }, { status: 500 });
  }
}
