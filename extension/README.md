# FPL Core – Copy FPL Token (Chrome extension)

One click copies your Fantasy Premier League access token to the clipboard, so
you can paste it into **FPL Core → My Team → Unlock private team data** and see
what FPL only shows the team's owner: selling prices, free transfers and
remaining chips.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → pick this `extension/` folder.
3. Pin the extension to the toolbar.

## Use

1. Sign in on [fantasy.premierleague.com](https://fantasy.premierleague.com) in
   any tab.
2. Click the extension icon — the token is copied straight away
   ("Copied to clipboard ✓"; the popup also shows when it expires).
3. Paste it on FPL Core's My Team page.

If it says *No token yet*, reload the FPL **Pick Team** page and click again.

## How it finds the token

- It reads the signed-in FPL tab's web storage for the site's OIDC session
  (`access_token`), via `chrome.scripting`.
- As a fallback, `background.js` remembers the `Bearer` token the FPL site
  sends on its own `/api/*` requests (`webRequest`, observe-only). That copy
  lives in `chrome.storage.session`: in memory, gone when Chrome closes.

The extension only has access to `fantasy.premierleague.com`, makes no network
requests of its own and sends the token nowhere — it only writes it to your
clipboard. Treat the token like a password; it expires on its own.
