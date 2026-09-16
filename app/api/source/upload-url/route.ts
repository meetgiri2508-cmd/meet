import { NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

function getR2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('R2 storage is not configured');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name || 'source.mp4');
    const contentType = String(body?.contentType || 'video/mp4');
    const size = Number(body?.size || 0);

    if (!contentType.startsWith('video/')) {
      return NextResponse.json({ error: 'Only video uploads are supported' }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: 'A valid file size is required' }, { status: 400 });
    }
    if (size > 5 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: 'Video is larger than the single-upload limit; multipart upload is required' }, { status: 413 });
    }

    const bucket = process.env.R2_BUCKET_NAME;
    const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    if (!bucket || !publicUrl) throw new Error('R2 bucket/public URL is not configured');

    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'source.mp4';
    const key = `sources/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
    const client = getR2();
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 3600 },
    );

    return NextResponse.json({
      ok: true,
      uploadUrl,
      sourceUrl: `${publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`,
      key,
      expiresIn: 3600,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create upload URL' }, { status: 500 });
  }
}