import express from "express";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || "";

const TOKEN_FILE = path.resolve(process.cwd(), "token.json");

function readToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeToken(token) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2), "utf8");
}

function assertEnv() {
  const missing = [];
  if (!TIKTOK_CLIENT_KEY) missing.push("TIKTOK_CLIENT_KEY");
  if (!TIKTOK_CLIENT_SECRET) missing.push("TIKTOK_CLIENT_SECRET");
  if (!TIKTOK_REDIRECT_URI) missing.push("TIKTOK_REDIRECT_URI");
  return missing;
}

async function tiktokTokenExchange({ code, redirect_uri }) {
  const body = new URLSearchParams();
  body.set("client_key", TIKTOK_CLIENT_KEY);
  body.set("client_secret", TIKTOK_CLIENT_SECRET);
  body.set("code", code);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", redirect_uri);

  const res = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30_000
  });
  return res.data; // { access_token, refresh_token, open_id, expires_in, ... } or error payload
}

async function tiktokStatusFetch({ access_token, publish_id }) {
  const res = await axios.post(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    { publish_id },
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      timeout: 30_000
    }
  );
  return res.data;
}

async function tiktokCreatorInfoQuery({ access_token }) {
  const res = await axios.post(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {},
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      timeout: 30_000
    }
  );
  return res.data;
}

function pickChunkPlan(fileSize) {
  // TikTok chunk rules (video): each chunk 5–64MB, last chunk can be larger (up to 128MB).
  // For demo: choose 10MB chunks when file is large enough; otherwise upload whole file.
  const MB = 1024 * 1024;
  if (fileSize <= 64 * MB) {
    return { chunkSize: fileSize, totalChunks: 1 };
  }
  const chunkSize = 10 * MB;
  const totalChunks = Math.ceil(fileSize / chunkSize);
  return { chunkSize, totalChunks };
}

async function tiktokVideoInit({ access_token, title, privacy_level, videoSize, chunkSize, totalChunks }) {
  const res = await axios.post(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      post_info: {
        title,
        privacy_level
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks
      }
    },
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      timeout: 30_000
    }
  );
  return res.data; // data.upload_url, data.publish_id
}

async function putChunk(uploadUrl, buf, start, end, total, mimeType) {
  const contentRange = `bytes ${start}-${end}/${total}`;
  const res = await axios.put(uploadUrl, buf, {
    headers: {
      "Content-Type": mimeType,
      "Content-Range": contentRange,
      "Content-Length": String(buf.length)
    },
    // 10min for slow upload
    timeout: 600_000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: (s) => s >= 200 && s < 300 || s === 206
  });
  return res.status; // 206 partial, 201 created
}

async function tiktokUploadVideoFile({ upload_url, filePath, chunkSize, totalChunks, mimeType }) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const fd = fs.openSync(filePath, "r");

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const endExclusive = Math.min(total, (i + 1) * chunkSize);
      const length = endExclusive - start;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      const end = endExclusive - 1;
      await putChunk(upload_url, buf, start, end, total, mimeType);
    }
  } finally {
    fs.closeSync(fd);
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));

// 允许从 GitHub Pages 等页面直接调用本地 demo 后端（用于录制审核视频）
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // 预检请求
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/health", (req, res) => {
  const missing = assertEnv();
  res.json({
    ok: true,
    missing_env: missing,
    has_token: Boolean(readToken()),
    hint: missing.length ? "Set env vars before exchange." : "Ready."
  });
});

// 你从 GitHub Pages 的 callback.html 复制出来的 JSON，直接 POST 到这里
app.post("/oauth/exchange", async (req, res) => {
  const missing = assertEnv();
  if (missing.length) return res.status(400).json({ error: "missing_env", missing });

  const { code, redirect_uri } = req.body || {};
  if (!code || !redirect_uri) return res.status(400).json({ error: "missing_code_or_redirect_uri" });

  try {
    const data = await tiktokTokenExchange({ code, redirect_uri });
    // TikTok 失败时通常会返回 { error, error_description, log_id }
    if (data?.error) return res.status(400).json(data);
    writeToken({ ...data, obtained_at: new Date().toISOString() });
    res.json({ ok: true, stored: true, open_id: data.open_id, scope: data.scope, expires_in: data.expires_in });
  } catch (e) {
    const msg = e?.response?.data || e?.message || String(e);
    res.status(500).json({ error: "exchange_failed", detail: msg });
  }
});

// Demo: direct post video via FILE_UPLOAD (works without URL ownership verification)
app.post("/post/video", async (req, res) => {
  const token = readToken();
  if (!token?.access_token) return res.status(400).json({ error: "no_token", hint: "Call /oauth/exchange first." });

  const { video_path, title, privacy_level, mime_type } = req.body || {};
  if (!video_path) return res.status(400).json({ error: "missing_video_path" });

  const abs = path.resolve(video_path);
  if (!fs.existsSync(abs)) return res.status(400).json({ error: "file_not_found", video_path: abs });

  // privacy_level must match creator_info/query options; for demo use SELF_ONLY if unsure
  const privacy = privacy_level || "SELF_ONLY";
  const t = title || "YCClaw Publisher demo upload";
  const mime = mime_type || "video/mp4";

  try {
    const stat = fs.statSync(abs);
    const { chunkSize, totalChunks } = pickChunkPlan(stat.size);
    const init = await tiktokVideoInit({
      access_token: token.access_token,
      title: t,
      privacy_level: privacy,
      videoSize: stat.size,
      chunkSize,
      totalChunks
    });

    const uploadUrl = init?.data?.upload_url;
    const publishId = init?.data?.publish_id;
    if (!uploadUrl || !publishId) return res.status(500).json({ error: "init_missing_fields", init });

    await tiktokUploadVideoFile({
      upload_url: uploadUrl,
      filePath: abs,
      chunkSize,
      totalChunks,
      mimeType: mime
    });

    res.json({ ok: true, publish_id: publishId, next: { method: "POST", path: "/status", body: { publish_id: publishId } } });
  } catch (e) {
    const msg = e?.response?.data || e?.message || String(e);
    res.status(500).json({ error: "video_post_failed", detail: msg });
  }
});

app.post("/status", async (req, res) => {
  const token = readToken();
  if (!token?.access_token) return res.status(400).json({ error: "no_token", hint: "Call /oauth/exchange first." });
  const { publish_id } = req.body || {};
  if (!publish_id) return res.status(400).json({ error: "missing_publish_id" });

  try {
    const data = await tiktokStatusFetch({ access_token: token.access_token, publish_id });
    res.json(data);
  } catch (e) {
    const msg = e?.response?.data || e?.message || String(e);
    res.status(500).json({ error: "status_failed", detail: msg });
  }
});

// 可选：用于录屏展示“先查询 creator info / privacy options，再发布”
app.post("/creator_info", async (req, res) => {
  const token = readToken();
  if (!token?.access_token) return res.status(400).json({ error: "no_token", hint: "Call /oauth/exchange first." });
  try {
    const data = await tiktokCreatorInfoQuery({ access_token: token.access_token });
    res.json(data);
  } catch (e) {
    const msg = e?.response?.data || e?.message || String(e);
    res.status(500).json({ error: "creator_info_failed", detail: msg });
  }
});

app.listen(PORT, () => {
  console.log(`YCClaw demo backend listening on http://localhost:${PORT}`);
  const missing = assertEnv();
  if (missing.length) {
    console.log("Missing env vars:", missing.join(", "));
    console.log("Example:");
    console.log("  export TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... TIKTOK_REDIRECT_URI=https://yicheng2031.github.io/Tiktok-YCClaw-Publisher/callback.html");
  }
});
