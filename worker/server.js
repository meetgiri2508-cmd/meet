import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const app = express();
app.use(express.json({ limit: '4mb' }));

const PORT = Number(process.env.PORT || 8080);
const WORKER_SECRET = process.env.WORKER_SECRET || '';
const r2Configured = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL);

const r2 = r2Configured ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
}) : null;

function auth(req, res, next) {
  if (!WORKER_SECRET || req.header('authorization') !== `Bearer ${WORKER_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-4000) || `exit ${code}`)));
  });
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}

function escapeSrtText(text) {
  return String(text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSrt(segments, clipStart, clipEnd) {
  const items = Array.isArray(segments) ? segments : [];
  const rows = [];
  let index = 1;
  for (const segment of items) {
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const text = escapeSrtText(segment?.text);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;
    const overlapStart = Math.max(start, clipStart);
    const overlapEnd = Math.min(end, clipEnd);
    if (overlapEnd <= overlapStart) continue;
    rows.push(`${index++}\n${srtTime(overlapStart - clipStart)} --> ${srtTime(overlapEnd - clipStart)}\n${text}\n`);
  }
  return rows.join('\n');
}

async function uploadToR2(filePath, key) {
  if (!r2) throw new Error('R2 storage is not configured');
  const body = await fs.readFile(filePath);
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'clipforge-worker', storage: r2Configured ? 'r2' : 'unconfigured' }));

app.post('/render', auth, async (req, res) => {
  const { sourceUrl, start, end, segments = [], captions = true } = req.body || {};
  const startTime = Number(start);
  const endTime = Number(end);
  if (!sourceUrl || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return res.status(400).json({ error: 'sourceUrl, start and end are required' });
  if (startTime < 0 || endTime <= startTime || endTime - startTime < 1 || endTime - startTime > 60) return res.status(400).json({ error: 'clip must be between 1 and 60 seconds' });
  if (!r2) return res.status(503).json({ error: 'R2 storage is not configured' });

  const id = crypto.randomUUID();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipforge-'));
  const output = path.join(dir, `${id}.mp4`);
  const subtitleFile = path.join(dir, `${id}.srt`);

  try {
    const args = [
      '-y', '-ss', String(startTime), '-i', sourceUrl, '-t', String(endTime - startTime),
    ];

    if (captions && Array.isArray(segments) && segments.length) {
      const srt = buildSrt(segments, startTime, endTime);
      if (srt) {
        await fs.writeFile(subtitleFile, srt, 'utf8');
        const escapedSubtitlePath = subtitleFile.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
        args.push('-vf', `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,subtitles='${escapedSubtitlePath}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=120'`);
      } else {
        args.push('-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2');
      }
    } else {
      args.push('-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2');
    }

    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', output);
    await run('ffmpeg', args);

    const stat = await fs.stat(output);
    const key = `clips/${new Date().toISOString().slice(0, 10)}/${id}.mp4`;
    const publicUrl = await uploadToR2(output, key);
    res.json({ ok: true, jobId: id, bytes: stat.size, outputUrl: publicUrl, format: 'mp4', width: 1080, height: 1920, duration: Number((endTime - startTime).toFixed(2)), captions: Boolean(captions && Array.isArray(segments) && segments.length) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'render failed' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`ClipForge worker listening on ${PORT}`));
