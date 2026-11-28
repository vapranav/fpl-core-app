// Popup: lists every FPL account the extension holds a token for (one per
// team ID), copies the chosen one, and toggles auto-fill on FPL Core.
//
// On open it also scans signed-in fantasy.premierleague.com tabs' web storage
// for the site's OIDC access_token and hands any it finds to background.js,
// which checks them with FPL and files them under their team.

const FPL_URL = "https://fantasy.premierleague.com/";
const APP_URL = "https://fpl-core-app.vercel.app/my-team";

const $ = (id) => document.getElementById(id);
let accounts = {};

// Runs inside the FPL tab. Collects every JWT-looking access token from
// localStorage/sessionStorage (OIDC session objects or bare tokens).
function scanStorage() {
  const isJwt = (s) => typeof s === "string" && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(s);
  const found = [];
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const raw = store.getItem(store.key(i));
      if (!raw) continue;
      if (isJwt(raw)) {
        found.push(raw);
        continue;
      }
      try {
        const obj = JSON.parse(raw);
        if (obj && isJwt(obj.access_token)) found.push(obj.access_token);
      } catch {
        /* not JSON */
      }
    }
  }
  return found;
}

/** Saves tokens found in open FPL tabs; returns the accounts they matched. */
async function scanTabs() {
  const tabs = await chrome.tabs.query({ url: "https://fantasy.premierleague.com/*" });
  const tokens = new Set();
  for (const tab of tabs) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanStorage });
      for (const t of res?.result ?? []) tokens.add(t);
    } catch {
      /* tab not scriptable (loading, discarded) */
    }
  }
  if (!tokens.size) return [];
  const saved = await chrome.runtime.sendMessage({ type: "save", tokens: [...tokens] });
  return (saved ?? []).filter(Boolean);
}

const isLive = (a) => !a.exp || a.exp > Date.now();

function fmtExpiry(a) {
  if (!a.exp) return "";
  if (!isLive(a)) return "Expired — sign in to this account on FPL again";
  const mins = Math.round((a.exp - Date.now()) / 60000);
  return mins < 120
    ? `Expires in ${mins} min`
    : `Expires ${new Date(a.exp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`;
}

function setStatus(text, tone) {
  $("status").textContent = text;
  $("status").className = `status ${tone ?? ""}`;
}

const selected = () => accounts[$("account").value] ?? null;

function renderSelected() {
  const a = selected();
  $("copy").disabled = !a || !isLive(a);
  $("remove").hidden = !a;
  $("meta").textContent = a ? [a.manager, fmtExpiry(a)].filter(Boolean).join(" · ") : "";
  setCopied(false);
}

function render(preferId) {
  const list = Object.values(accounts).sort(
    (x, y) => Number(isLive(y)) - Number(isLive(x)) || (y.savedAt ?? 0) - (x.savedAt ?? 0),
  );
  const select = $("account");
  select.replaceChildren(
    ...list.map((a) => {
      const opt = document.createElement("option");
      opt.value = a.entryId;
      opt.textContent = `${a.teamName ?? "Team"} · ${a.entryId}${isLive(a) ? "" : " (expired)"}`;
      return opt;
    }),
  );
  $("picker").hidden = list.length === 0;
  $("open-fpl").hidden = list.some(isLive);
  if (preferId && accounts[preferId]) select.value = preferId;
  renderSelected();
  return list;
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
  $("copy").textContent = copied ? "Copied ✓" : "Copy token";
  $("copy").classList.toggle("copied", copied);
}

async function copy() {
  const a = selected();
  if (!a || !isLive(a)) return;
  if (await writeClipboard(a.token)) {
    setStatus(`Copied token for team ${a.entryId} ✓`, "ok");
    setCopied(true);
  } else {
    setStatus("Couldn't copy — try the button again", "err");
  }
}

async function remove() {
  const a = selected();
  if (!a) return;
  await chrome.runtime.sendMessage({ type: "remove", entryId: a.entryId });
  delete accounts[a.entryId];
  const left = render();
  setStatus(left.length ? `Removed team ${a.entryId}` : "No saved accounts", "");
}

async function main() {
  $("app-link").href = APP_URL;
  $("open-fpl").addEventListener("click", () => chrome.tabs.create({ url: FPL_URL }));
  $("copy").addEventListener("click", copy);
  $("remove").addEventListener("click", remove);
  $("account").addEventListener("change", () => {
    renderSelected();
    setStatus(`${Object.keys(accounts).length} saved account(s)`, "");
  });

  const { autoSync = true } = await chrome.storage.local.get("autoSync");
  $("auto-sync").checked = autoSync;
  $("auto-sync").addEventListener("change", (e) => chrome.storage.local.set({ autoSync: e.target.checked }));

  const fromTabs = await scanTabs();
  ({ accounts = {} } = await chrome.storage.local.get("accounts"));
  const current = fromTabs.find(isLive);
  const list = render(current?.entryId);

  if (!list.length) {
    setStatus("No accounts yet", "err");
    $("meta").textContent =
      "Open fantasy.premierleague.com and sign in (or reload its Pick Team page), then click the icon again.";
    return;
  }
  if (current) {
    await copy(); // one click copies the account signed in on FPL right now
    return;
  }
  setStatus(`${list.length} saved account(s)`, list.some(isLive) ? "" : "err");
}

main().catch((e) => setStatus(`Something went wrong: ${e.message}`, "err"));
