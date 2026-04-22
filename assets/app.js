function qs(id) { return document.getElementById(id); }

function saveConfig() {
  const cfg = {
    clientKey: qs("clientKey")?.value?.trim() || "",
    redirectUri: qs("redirectUri")?.value?.trim() || "",
    scopes: Array.from(document.querySelectorAll('input[name="scope"]:checked')).map(x => x.value),
    disableAutoAuth: qs("disableAutoAuth")?.value || "1",
  };
  localStorage.setItem("ycclaw_demo_cfg", JSON.stringify(cfg));
  renderAuthUrl();
}

function loadConfig() {
  const raw = localStorage.getItem("ycclaw_demo_cfg");
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw);
    if (cfg.clientKey && qs("clientKey")) qs("clientKey").value = cfg.clientKey;
    if (cfg.redirectUri && qs("redirectUri")) qs("redirectUri").value = cfg.redirectUri;
    if (Array.isArray(cfg.scopes)) {
      for (const el of document.querySelectorAll('input[name="scope"]')) {
        el.checked = cfg.scopes.includes(el.value);
      }
    }
    if (cfg.disableAutoAuth && qs("disableAutoAuth")) qs("disableAutoAuth").value = cfg.disableAutoAuth;
  } catch {}
}

function buildAuthorizeUrl({ clientKey, redirectUri, scopes, state, disableAutoAuth }) {
  const base = "https://www.tiktok.com/v2/auth/authorize/";
  const params = new URLSearchParams();
  params.set("client_key", clientKey);
  params.set("response_type", "code");
  params.set("scope", (scopes || []).join(","));
  params.set("redirect_uri", redirectUri);
  params.set("state", state);
  params.set("disable_auto_auth", disableAutoAuth ?? "1");
  return `${base}?${params.toString()}`;
}

function randomState() {
  // 简化：用于 demo 的 state；生产建议在服务端生成并校验
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function renderAuthUrl() {
  const clientKey = qs("clientKey")?.value?.trim();
  const redirectUri = qs("redirectUri")?.value?.trim();
  const scopes = Array.from(document.querySelectorAll('input[name="scope"]:checked')).map(x => x.value);
  const disableAutoAuth = qs("disableAutoAuth")?.value || "1";
  const state = randomState();

  const output = qs("authUrl");
  const btn = qs("btnAuth");
  const status = qs("cfgStatus");

  if (!clientKey || !redirectUri || scopes.length === 0) {
    if (output) output.textContent = "Fill Client Key, Redirect URI, and select at least one scope.";
    if (btn) btn.disabled = true;
    if (status) status.innerHTML = '<span class="pill"><span class="dot"></span>Config incomplete</span>';
    return;
  }

  const url = buildAuthorizeUrl({ clientKey, redirectUri, scopes, state, disableAutoAuth });
  if (output) output.textContent = url;
  if (btn) btn.disabled = false;
  if (status) status.innerHTML = '<span class="pill"><span class="dot ok"></span>Config ready</span>';

  // 记住最近一次 state，方便 callback 页提示（demo 用）
  localStorage.setItem("ycclaw_last_state", state);
}

function goAuthorize() {
  const url = qs("authUrl")?.textContent?.trim();
  if (!url || url.startsWith("Fill ")) return;
  window.location.href = url;
}

function init() {
  // 自动填 redirect_uri（推荐使用以 / 结尾的目录路径，避免 TikTok 对 redirect URI 的严格匹配导致的误报）
  // 例如：https://<host>/<repo>/callback/
  const basePath = window.location.pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "/");
  const autoRedirect = `${window.location.origin}${basePath}callback/`;
  if (qs("redirectUri") && !qs("redirectUri").value) {
    qs("redirectUri").value = autoRedirect;
  }

  loadConfig();
  renderAuthUrl();

  for (const el of document.querySelectorAll("input,select")) {
    el.addEventListener("change", saveConfig);
    el.addEventListener("input", saveConfig);
  }

  qs("btnAuth")?.addEventListener("click", goAuthorize);
  qs("btnCopy")?.addEventListener("click", async () => {
    const text = qs("authUrl")?.textContent || "";
    await navigator.clipboard.writeText(text);
    qs("btnCopy").textContent = "Copied";
    setTimeout(() => (qs("btnCopy").textContent = "Copy URL"), 900);
  });

  async function callLocal(path, body) {
    const out = qs("localRespHome");
    if (!out) return;
    out.textContent = `(calling http://localhost:8787${path} ...)`;
    try {
      const resp = await fetch(`http://localhost:8787${path}`, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const txt = await resp.text();
      try {
        out.textContent = JSON.stringify(JSON.parse(txt), null, 2);
      } catch {
        out.textContent = txt;
      }
    } catch (e) {
      out.textContent = `Request failed: ${e?.message || e}`;
    }
  }

  qs("btnHealth")?.addEventListener("click", () => callLocal("/health"));
  qs("btnCreator")?.addEventListener("click", () => callLocal("/creator_info", {}));
}

document.addEventListener("DOMContentLoaded", init);
