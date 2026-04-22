# YCClaw Publisher — Local Demo Backend (for TikTok App Review Video)

This backend is only for recording the TikTok app review demo video.

It supports:
- Exchange OAuth `code` → `access_token` / `refresh_token` (stored in `token.json`)
- Query creator info / privacy options (for UX compliance demo)
- Post a **video** via Content Posting API (FILE_UPLOAD)
- Fetch post status via `publish_id`

> Notes: Photo posting requires `PULL_FROM_URL` and URL ownership verification for image URLs. For a fast demo, use video upload.

## 1) Install

```bash
cd local-demo-backend
npm install
```

## 2) Configure env

Set these env vars:

```bash
export TIKTOK_CLIENT_KEY="YOUR_CLIENT_KEY"
export TIKTOK_CLIENT_SECRET="YOUR_CLIENT_SECRET"
export TIKTOK_REDIRECT_URI="https://yicheng2031.github.io/Tiktok-YCClaw-Publisher/callback.html"
```

## 3) Start server

```bash
npm start
```

Health check:

```bash
curl http://localhost:8787/health
```

## 4) OAuth exchange

1. Open the GitHub Pages demo:
   - https://yicheng2031.github.io/Tiktok-YCClaw-Publisher/
2. Click **Continue with TikTok**
3. After redirect, open `callback.html` and copy the JSON block.
4. POST it to:

```bash
curl -X POST http://localhost:8787/oauth/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"PASTE_CODE_HERE","redirect_uri":"https://yicheng2031.github.io/Tiktok-YCClaw-Publisher/callback.html"}'
```

## 5) Post a video (direct post)

```bash
curl -X POST http://localhost:8787/post/video \
  -H "Content-Type: application/json" \
  -d '{"video_path":"/absolute/path/to/demo.mp4","title":"YCClaw demo","privacy_level":"SELF_ONLY","mime_type":"video/mp4"}'
```

It returns `{ publish_id }`.

## 6) Poll status

```bash
curl -X POST http://localhost:8787/status \
  -H "Content-Type: application/json" \
  -d '{"publish_id":"PASTE_PUBLISH_ID"}'
```

## (Optional) Creator info query

This is useful to show that you respect the creator's privacy options in your demo video.

```bash
curl -X POST http://localhost:8787/creator_info
```
