// Watches the FPL site's own API calls and remembers the bearer token it sends,
// so the popup can copy it even if the site keeps the token only in memory.
// The token is held in chrome.storage.session: in memory, cleared when the
// browser closes, never synced and never sent anywhere by this extension.

const HEADER_NAMES = new Set(["x-api-authorization", "authorization"]);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    for (const h of details.requestHeaders ?? []) {
      if (!HEADER_NAMES.has(h.name.toLowerCase()) || !h.value) continue;
      const m = h.value.match(/^Bearer\s+(.+)$/i);
      if (!m) continue;
      chrome.storage.session.set({
        captured: { token: m[1].trim(), at: Date.now() },
      });
      return;
    }
  },
  { urls: ["https://fantasy.premierleague.com/api/*"] },
  ["requestHeaders", "extraHeaders"],
);
