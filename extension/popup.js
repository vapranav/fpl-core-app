// One click on the toolbar icon: find the FPL access token and copy it.
//
// Sources, best first:
//  1. a signed-in fantasy.premierleague.com tab's web storage (the site's OIDC
//     client keeps the user session, access_token included, there)
//  2. the bearer token background.js saw on the site's latest API request

const FPL_URL = "https://fantasy.premierleague.com/";
const APP_URL = "https://fpl-core-app.vercel.app/my-team";

const $ = (id) => document.getElementById(id);
let current = null;

function decodeExp(token) {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

// Runs inside the FPL tab. Collects every JWT-looking access token from
// localStorage/sessionStorage (OIDC session objects or bare tokens).
function scanStorage() {
  const isJwt = (s) => typeof s === "string" && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(s);
  const found = [];
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      const raw = store.getItem(key);
      if (!raw) continue;
      if (isJwt(raw)) {
        found.push({ token: raw, key, oidc: false });
        continue;
      }
      try {
        const obj = JSON.parse(raw);
        if (obj && isJwt(obj.access_token)) found.push({ token: obj.access_token, key, oidc: true });
      } catch {
        /* not JSON */
      }
    }
  }
  return found;
}

async function fromTabs() {
  const tabs = await chrome.tabs.query({ url: "https://fantasy.premierleague.com/*" });
  const candidates = [];
  for (const tab of tabs) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scanStorage,
      });
      for (const c of res?.result ?? []) candidates.push({ ...c, source: "FPL tab" });
    } catch {
      /* tab not scriptable (loading, discarded) */
    }
  }
  return { tabs, candidates };
}

async function fromCapture() {
  const { captured } = await chrome.storage.session.get("captured");
  return captured ? [{ token: captured.token, source: "last FPL request" }] : [];
}

// unexpired tokens only, latest expiry first
function pick(candidates) {
  const now = Date.now();
  const scored = candidates
    .map((c) => ({ ...c, exp: decodeExp(c.token) }))
    .filter((c) => c.exp === null || c.exp > now);
  // an OIDC session's access_token beats a bare JWT (which may be an ID token)
  scored.sort((a, b) => (b.oidc ? 1 : 0) - (a.oidc ? 1 : 0) || (b.exp ?? 0) - (a.exp ?? 0));
  return scored[0] ?? null;
}

function fmtExpiry(exp) {
  if (!exp) return "";
  const mins = Math.round((exp - Date.now()) / 60000);
  return mins < 120
    ? `Expires in ${mins} min`
    : `Expires ${new Date(exp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`;
}

function setStatus(text, tone) {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${tone ?? ""}`;
}

// the popup may open without focus, which the async clipboard API refuses;
// execCommand on a hidden textarea still works in an extension popup
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function setCopied(copied) {
  const btn = $("copy");
  btn.textContent = copied ? "Copied ✓" : "Copy token";
  btn.classList.toggle("copied", copied);
}

let resetTimer;
async function copy() {
  if (!current) return false;
  clearTimeout(resetTimer);
  const ok = await writeClipboard(current.token);
  if (ok) {
    setStatus("Copied to clipboard ✓", "ok");
    setCopied(true);
    // after a while, offer the button again (status line keeps saying copied)
    resetTimer = setTimeout(() => {
      $("copy").textContent = "Copy again";
      $("copy").classList.remove("copied");
    }, 3000);
  } else {
    setStatus("Found your token — click Copy", "");
    setCopied(false);
  }
  return ok;
}

async function main() {
  $("app-link").href = APP_URL;
  $("open-fpl").addEventListener("click", () => chrome.tabs.create({ url: FPL_URL }));
  $("copy").addEventListener("click", copy);

  const { tabs, candidates } = await fromTabs();
  current = pick([...candidates, ...(await fromCapture())]);

  if (!current) {
    $("open-fpl").hidden = false;
    setStatus(tabs.length ? "No token yet" : "No FPL tab open", "err");
    $("meta").textContent = tabs.length
      ? "Sign in on fantasy.premierleague.com (or reload its Pick Team page), then click the icon again."
      : "Open fantasy.premierleague.com, sign in, then click the icon again.";
    return;
  }

  $("copy").disabled = false;
  $("meta").textContent = [fmtExpiry(current.exp), `from ${current.source}`]
    .filter(Boolean)
    .join(" · ");
  await copy(); // the one click: opening the popup copies straight away
}

main().catch((e) => setStatus(`Something went wrong: ${e.message}`, "err"));
