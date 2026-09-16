# ClipForge worker

This worker is the media-processing layer for ClipForge. It runs outside Vercel because FFmpeg/video rendering can exceed serverless execution limits.

## What it will do

1. Receive an authorized source video and clip plan.
2. Use FFmpeg to trim each segment.
3. Reframe to 9:16.
4. Burn captions from a generated `.srt`/`.ass` file.
5. Upload rendered MP4s to object storage.
6. Return public/signed URLs to the app.

## Runtime

Install FFmpeg on the worker host and run a Node.js service. A production implementation should put jobs on a queue (for example Redis/BullMQ) and store source/output files in S3-compatible object storage.

The worker must only process content the user owns or is authorized to repurpose.
