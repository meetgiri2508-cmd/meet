export type YouTubeUploadInput = {
  accessToken: string;
  video: Blob;
  title: string;
  description?: string;
  privacyStatus?: 'private' | 'public' | 'unlisted';
};

export async function uploadToYouTube(input: YouTubeUploadInput) {
  const metadata = {
    snippet: {
      title: input.title.slice(0, 100),
      description: input.description || '',
      categoryId: '22',
    },
    status: {
      privacyStatus: input.privacyStatus || 'private',
      selfDeclaredMadeForKids: false,
    },
  };

  const boundary = `clipforge-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${input.video.type || 'video/mp4'}\r\n\r\n`,
    input.video,
    `\r\n--${boundary}--\r\n`,
  ]);

  const res = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  const json = await res.json();
  if (!res.ok) throw new Error(`YouTube API error: ${json?.error?.message || res.statusText}`);
  return json;
}
