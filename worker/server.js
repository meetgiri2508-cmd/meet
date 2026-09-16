import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 8080);
const WORKER_SECRET = process.env.WORKER_SECRET || '';

function auth(req, res, next) {
  if (WORKER_SECRET && req.header('authorization') !== `Bearer ${WORKER_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
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

app.get('/health', (_req, res) => res.json({ ok: true, service: 'clipforge-worker' }));

app.post('/render', auth, async (req, res) => {
  const { sourceUrl, start, end, outputUrl } = req.body || {};
  if (!sourceUrl || !Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) {
    return res.status(400).json({ error: 'sourceUrl, start and end are required' });
  }
  if (Number(end) <= Number(start) || Number(end) - Number(start) > 60) {
    return res.status(400).json({ error: 'clip must be between 0 and 60 seconds' });
  }

  const id = crypto.randomUUID();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipforge-'));
  const output = path.join(dir, `${id}.mp4`);

  try {
    // The worker owns the expensive FFmpeg step; Vercel only orchestrates jobs.
    await run('ffmpeg', [
      '-y', '-ss', String(start), '-i', sourceUrl, '-t', String(Number(end) - Number(start)),
      '-vf', "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', output
    ]);

    const stat = await fs.stat(output);
    // Production storage upload should be added here (S3/R2/GCS).
    res.json({ ok: true, jobId: id, file: output, bytes: stat.size, outputUrl: outputUrl || null });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'render failed' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`ClipForge worker listening on ${PORT}`));
