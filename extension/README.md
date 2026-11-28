# FPL Core – FPL Tokens (Chrome extension)

Keeps an FPL access token for each Fantasy Premier League account you sign in
to, and fills the matching one into **FPL Core → My Team** so you can see what
FPL only shows a team's owner: selling prices, free transfers and remaining
chips.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → pick this `extension/` folder (or click ↻ on the card
   after pulling changes).
3. Pin the extension to the toolbar.

## Use

1. Sign in on [fantasy.premierleague.com](https://fantasy.premierleague.com).
   The extension picks up the token as soon as the site calls its API (open
   Pick Team if it hasn't). Repeat for every account you have: sign out, sign
   in with the next one.
2. Click the extension icon to see every saved account in the **Account**
   dropdown (team name · team ID, with expiry). The account signed in on FPL
   right now is copied straight away. Pick another one and **Copy token** to
   copy that, or **Remove** to forget it.
3. On FPL Core, connect a team ID on My Team. If the extension has a live
   token for that team, it fills it in automatically. Switch to another team
   and its token is swapped in. Turn this off with **Auto-fill the matching
   token on FPL Core** in the popup.

Tokens expire after a few hours. When one does, sign in to that account on FPL
again and the stored token is refreshed (FPL Core picks up the new one too).

## How it works

- **Capture:** `background.js` watches the `Bearer` token the FPL site sends
  on its own `/api/*` requests (`webRequest`, observe-only). The popup also
  reads signed-in FPL tabs' web storage for the site's OIDC `access_token`.
- **Mapping:** each new token is checked once with FPL's `/api/me/` (token
  only, no cookies) to learn its team ID, and `/api/entry/{id}/` for the team
  name. Tokens FPL rejects are dropped. Accounts are stored in
  `chrome.storage.local` keyed by team ID, one token per team (the
  longer-lived one wins). Accounts that expired over 30 days ago are pruned.
- **Auto-fill:** `fpl-core-sync.js` runs on `fpl-core-app.vercel.app` and
  `localhost:3000`. It reads the app's `fpl-entry-id` and writes the matching
  token to `fpl-api-token`. It won't overwrite a hand-pasted token that
  outlives the stored one.

The extension makes requests only to `fantasy.premierleague.com` and never
sends tokens anywhere else. Note that `chrome.storage.local` persists on disk
in your Chrome profile (unencrypted), so anyone with access to that profile can
read the tokens. Treat them like passwords.
