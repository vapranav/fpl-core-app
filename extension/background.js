// Keeps one FPL access token per FPL team, so the popup can list every account
// you've signed into and fpl-core-sync.js can fill the right one into FPL Core.
//
// Tokens arrive two ways:
//  - the bearer token the FPL site sends on its own /api/* requests (observed
//    here with webRequest; observe-only, nothing is modified)
//  - tokens the popup finds in a signed-in FPL tab's web storage ("save" message)
//
// Each new token is checked against FPL's /api/me/ (sent with that token only,
// no cookies) to learn which team it belongs to; a token FPL rejects is dropped.
// The account list lives in chrome.storage.local, keyed by team ID:
//   accounts: { [entryId]: { entryId, token, exp, manager, teamName, savedAt } }
// It never leaves this browser: the only requests the extension makes go to
// fantasy.premierleague.com.

const FPL_API = "https://fantasy.premierleague.com/api";
const HEADER_NAMES = new Set(["x-api-authorization", "authorization"]);
const PRUNE_AFTER_MS = 30 * 24 * 3600 * 1000; // forget accounts expired a month ago

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

/** Which team a token belongs to, or null (rejected token, or no team yet). */
async function identify(token) {
  const r = await fetch(`${FPL_API}/me/`, {
    headers: { "X-Api-Authorization": `Bearer ${token}` },
    credentials: "omit", // the token alone decides the account, not site cookies
  });
  if (!r.ok) return null;
  const player = (await r.json())?.player;
  if (!player?.entry) return null;
  let teamName = null;
  try {
    const e = await fetch(`${FPL_API}/entry/${player.entry}/`, { credentials: "omit" });
    if (e.ok) teamName = (await e.json())?.name ?? null;
  } catch {
    /* name is cosmetic */
  }
  const manager = [player.first_name, player.last_name].filter(Boolean).join(" ");
  return { entryId: String(player.entry), manager: manager || null, teamName };
}

// storage writes run one at a time so concurrent captures can't clobber each other
let writeQueue = Promise.resolve();
function serial(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

const inflight = new Map(); // token -> Promise<account|null>

async function getAccounts() {
  const { accounts = {} } = await chrome.storage.local.get("accounts");
  return accounts;
}

/** Stores a token under its team; returns the account or null. */
function saveToken(raw) {
  const token = raw.trim();
  if (!inflight.has(token)) {
    const job = (async () => {
      const exp = decodeExp(token);
      if (exp !== null && exp <= Date.now()) return null;
      const known = Object.values(await getAccounts()).find((a) => a.token === token);
      if (known) return known;
      const who = await identify(token);
      if (!who) return null;
      return serial(async () => {
        const accounts = await getAccounts();
        const prev = accounts[who.entryId];
        // a fresher token for the same team may already be stored
        if (prev && prev.exp && exp && prev.exp > exp) return prev;
        const account = { ...who, token, exp, savedAt: Date.now() };
        accounts[who.entryId] = account;
        for (const [id, a] of Object.entries(accounts)) {
          if (a.exp && a.exp < Date.now() - PRUNE_AFTER_MS) delete accounts[id];
        }
        await chrome.storage.local.set({ accounts });
        return account;
      });
    })().finally(() => setTimeout(() => inflight.delete(token), 60_000));
    inflight.set(token, job);
  }
  return inflight.get(token);
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0) return; // our own /me/ checks, not the FPL site
    for (const h of details.requestHeaders ?? []) {
      if (!HEADER_NAMES.has(h.name.toLowerCase()) || !h.value) continue;
      const m = h.value.match(/^Bearer\s+(.+)$/i);
      if (!m) continue;
      saveToken(m[1]).catch(() => {});
      return;
    }
  },
  { urls: ["https://fantasy.premierleague.com/api/*"] },
  ["requestHeaders", "extraHeaders"],
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type === "save" && Array.isArray(msg.tokens)) {
    Promise.all(msg.tokens.map((t) => saveToken(t).catch(() => null))).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === "remove" && typeof msg.entryId === "string") {
    serial(async () => {
      const accounts = await getAccounts();
      delete accounts[msg.entryId];
      await chrome.storage.local.set({ accounts });
    }).then(() => sendResponse(true));
    return true;
  }
});
