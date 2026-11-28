// Content script on FPL Core. Whenever the connected team (localStorage
// "fpl-entry-id") has a stored token in the extension, writes it to the app's
// "fpl-api-token" key, so switching teams or getting a fresh token on FPL needs
// no copy-paste. Turn it off from the popup ("Auto-fill on FPL Core").

const ENTRY_KEY = "fpl-entry-id";
const TOKEN_KEY = "fpl-api-token";

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

function readPage() {
  try {
    return { entry: localStorage.getItem(ENTRY_KEY), current: localStorage.getItem(TOKEN_KEY) };
  } catch {
    return { entry: null, current: null };
  }
}

async function sync() {
  const { entry, current } = readPage();
  if (!entry) return;
  const { accounts = {}, autoSync = true } = await chrome.storage.local.get(["accounts", "autoSync"]);
  if (!autoSync) return;
  const account = accounts[entry];
  if (!account || account.token === current) return;
  const now = Date.now();
  if (account.exp && account.exp <= now) return;

  // leave alone a token pasted by hand (unknown to us) that outlives ours
  const known = Object.values(accounts).some((a) => a.token === current);
  const currentExp = current ? decodeExp(current) : null;
  if (current && !known && currentExp && currentExp > now && currentExp >= (account.exp ?? 0)) return;

  localStorage.setItem(TOKEN_KEY, account.token);
  // same-tab localStorage writes fire no "storage" event; send one so the
  // app's useFplToken hook re-reads the key
  window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_KEY, newValue: account.token }));
}

function safeSync() {
  sync().catch(() => {});
}

// the app writes the entry id in this same tab (no event), so watch for it
let lastSeen = "";
const timer = setInterval(() => {
  if (!chrome.runtime?.id) return clearInterval(timer); // extension reloaded
  const { entry, current } = readPage();
  const key = `${entry}|${current}`;
  if (key === lastSeen) return;
  lastSeen = key;
  safeSync();
}, 1000);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.accounts || changes.autoSync)) safeSync();
});
window.addEventListener("storage", (e) => {
  if (e.key === ENTRY_KEY) safeSync();
});
safeSync();
