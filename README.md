# YCClaw Publisher — GitHub Pages Demo

This repo hosts a small **static** demo site for TikTok app review:
- Login Kit OAuth authorize URL generator
- OAuth callback page that extracts `code`, `state`, and `scopes`
- Legal pages (Terms of Service / Privacy Policy)

## Pages
- `/` → `index.html`
- `/callback/` (recommended redirect URI)
- `/terms-of-service.html`
- `/privacy-policy.html`

## Notes
This is a static site. Exchanging `code` for tokens requires a backend server to securely store `client_secret` and `refresh_token`.

## Demo video (no terminal option)
If you also run the local demo backend on `http://localhost:8787`, the home page provides buttons to:
- Check backend health
- Query creator info
- Post a video (by providing an absolute local file path)
- Fetch post status (by providing publish_id)
