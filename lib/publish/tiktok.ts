export type TikTokDirectPostInput = {
  accessToken: string;
  videoUrl: string;
  title: string;
  privacyLevel: string;
  isAigc?: boolean;
};

const API = 'https://open.tiktokapis.com/v2';

async function tiktok<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json?.error?.code !== 'ok') {
    throw new Error(`TikTok API error: ${json?.error?.message || res.statusText}`);
  }
  return json;
}

export async function getTikTokCreatorInfo(accessToken: string) {
  return tiktok('/post/publish/creator_info/query/', accessToken, {});
}

export async function directPostTikTok(input: TikTokDirectPostInput) {
  return tiktok('/post/publish/video/init/', input.accessToken, {
    post_info: {
      title: input.title.slice(0, 2200),
      privacy_level: input.privacyLevel,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      is_aigc: Boolean(input.isAigc),
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: input.videoUrl,
    },
  });
}

export async function getTikTokPostStatus(accessToken: string, publishId: string) {
  return tiktok('/post/publish/status/fetch/', accessToken, { publish_id: publishId });
}
