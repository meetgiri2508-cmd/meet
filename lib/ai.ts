export type ClipCandidate = {
  start: number;
  end: number;
  title: string;
  hookScore: number;
  reason: string;
  caption: string;
};

export async function selectClips(transcript: string, count = 5): Promise<ClipCandidate[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const prompt = `You are a short-form video editor. From the timestamped transcript below, select ${Math.min(count, 10)} independent clips that can work as YouTube Shorts/TikTok videos. Prefer strong hooks, surprising insights, emotional moments, useful explanations and self-contained stories. Avoid clips that require missing context. Keep each clip 15-60 seconds. Return ONLY JSON matching this schema: {"clips":[{"start":number,"end":number,"title":string,"hookScore":number,"reason":string,"caption":string}]}. hookScore is 0-100.\n\nTRANSCRIPT:\n${transcript.slice(0, 120000)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`OpenAI clip selection failed: ${await response.text()}`);
  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{"clips":[]}');
  return Array.isArray(parsed.clips) ? parsed.clips : [];
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const form = new FormData();
  form.append('file', audio, 'source.mp3');
  form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!response.ok) throw new Error(`OpenAI transcription failed: ${await response.text()}`);
  const data = await response.json();
  return data.text || '';
}
