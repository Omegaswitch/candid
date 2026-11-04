# Google Sheets connection

Candid imports projects from a Google spreadsheet and exports to Google Sheets. Both are started by a
person, one at a time: there is no background sync. Each member connects their own Google account in
**Settings → Integrations**; the tokens are stored per membership, encrypted, and never sent to the browser.

## Scopes, and why only these

```
https://www.googleapis.com/auth/spreadsheets openid email
```

- `spreadsheets` — read the spreadsheet the person pastes a link to, and create or write the
  spreadsheets Candid exports to. It is the narrowest scope that covers both: the read-only Sheets
  scope cannot create an export, and `drive.file` would need the Google Picker to grant access to an
  existing file.
- `openid email` — only to show which Google account is connected.
- **No Drive scope.** Candid never lists or searches your Drive. The person pastes the spreadsheet's URL
  (or its ID), so Candid only touches files they point it at, plus the ones it creates.

If someone unticks the Sheets permission on Google's consent screen, the connection is refused with a
message asking them to connect again with it ticked.

## Google Cloud console

1. **Create a project** at <https://console.cloud.google.com/> (or reuse the company's).
2. **Enable the Google Sheets API**: APIs & Services → Library → "Google Sheets API" → Enable.
   (Drive API is not needed.)
3. **OAuth consent screen** (Google Auth Platform → Branding / Audience):
   - User type **Internal** if the team uses Google Workspace: only accounts in your Workspace can
     connect and Google's app verification is not needed.
   - Otherwise **External**; while the app is in *Testing*, add each person under *Test users*.
     Note that in Testing mode Google expires refresh tokens after 7 days (people will see
     "Reconnect Google" weekly) — publish the app to avoid this. `spreadsheets` is a sensitive scope,
     so a published External app needs Google's verification.
   - App name, support email, and the app domain.
4. **Scopes** (Data access): add `.../auth/spreadsheets`, `openid`, `.../auth/userinfo.email`.
5. **Create the client**: Clients → Create client → *Web application*.
   - **Authorised redirect URIs** — exact match, one per environment:
     - local: `http://localhost:3100/api/google/callback` (use your dev port)
     - production: `https://<your-domain>/api/google/callback`
   - Authorised JavaScript origins are not needed (the flow is server-side).
6. Copy the client ID and secret into the environment.

## Environment

See `docs/env/google.env.example`.

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth web client secret |
| `APP_URL` | Public origin, no trailing slash, e.g. `https://candid.example.com`. The redirect URI is `${APP_URL}/api/google/callback` and must be registered exactly. |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 |

Generate the key once per environment and keep it in the secret store:

```sh
openssl rand -base64 32
# or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Changing the key makes the stored tokens unreadable: everyone has to reconnect Google. Until
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL` are set, the app shows "Google is not set up"
instead of a Connect button (`GET /api/google/status` returns `configured: false`).

## How the flow works

1. **Connect** (`GET /api/google/connect?returnTo=/path`) redirects to Google with
   `access_type=offline`, `prompt=consent` (so Google returns a refresh token), PKCE (`S256`) and a
   `state` that is HMAC-signed and names the member and a random nonce. The same nonce and the PKCE
   verifier go into a short-lived (10 min), httpOnly, `SameSite=Lax` cookie, encrypted.
2. **Callback** (`GET /api/google/callback`) checks the signature, the expiry, that the signed-in member
   is the one who started, and that the cookie's nonce matches; then exchanges the code (with the PKCE
   verifier) at Google's token endpoint. The account email is read from the `id_token` returned by that
   TLS call. Access and refresh tokens are encrypted with AES-256-GCM (random IV, auth tag) and stored in
   `integration_connections`, one row per member and provider. The browser returns to `returnTo` with
   `?connected=1`, or `?google_error=state|denied|exchange|scope|not_configured`.
3. **Disconnect** (`POST /api/google/disconnect`) revokes the token at Google (best effort) and deletes
   the row. Removing a member also deletes their connection.

## Expiry and revocation

- Access tokens last about an hour. Before each Sheets call the server refreshes the token when it
  expires within 60 seconds. A 401 from Sheets triggers one forced refresh and a retry.
- If Google refuses the refresh (`invalid_grant`: the person revoked access at
  <https://myaccount.google.com/permissions>, changed their password, the token expired after 6 months
  unused, or the 7-day Testing limit), or Sheets still answers 401 after a refresh, the connection is
  marked **revoked**. Every Google action then answers with an `integration` error carrying
  `details.reconnect: true`, and the UI shows **Reconnect Google** wherever the error appears.
- 403/404 on a spreadsheet means the connected account cannot open it: "You don't have access to this
  spreadsheet with the connected Google account". 429 is retried twice with backoff.

## Reading and writing

- Import reads with `values:batchGet`, `valueRenderOption=UNFORMATTED_VALUE` and
  `dateTimeRenderOption=FORMATTED_STRING`: Google returns the values it already calculated. Candid never
  evaluates formulas.
- Export writes with `values:batchUpdate` and `valueInputOption=RAW`, so text such as `=SUM(A1)` is
  stored as text, never as a formula. A new export creates a spreadsheet with *Projects* and *Tasks*
  worksheets; exporting into an existing spreadsheet adds two worksheets named with the date
  (`Projects 2026-11-04`, then `… (2)` if taken) and leaves the other worksheets untouched.

## Testing

The unit tests (`src/server/google.test.ts`) mock `fetch`; they cover the state signing, the callback
checks, refresh/expiry/revocation and the Sheets error mapping. The live Google round trip has to be
checked by hand against a real OAuth client.
