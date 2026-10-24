# Live dev backend smoke test

This is a real integration check for the Validation Bench's existing `BackendClient`
contract. It does not mock requests and does not send reports, send email, or create orders.

## GitHub Actions setup

Add these repository Actions secrets:

- `DEV_BACKEND_URL`: HTTPS backend origin only, without `/api/v1`
- `DEV_BACKEND_LOGIN`: test account login
- `DEV_BACKEND_PASSWORD`: test account password

Run **Actions → Live dev backend smoke test → Run workflow**. The live job is
manual-only so credentials are never required or exposed to pull-request code.
The pull-request job checks script syntax only; it is not evidence of a live integration.

## Checks performed

1. `POST /api/v1/auth` with the same `type=e-mail` login contract as `BackendClient`.
2. `POST /api/v1/token` using the returned `auth_hash`.
3. `GET /api/v1/data/?json_like=...` and a non-empty `site_emails` data object.

The script logs stage names and HTTP status only. It never prints credentials, tokens,
or response bodies. A passing result confirms only this API authentication/read path;
it does not claim that the Voice Platform's Order FSM is connected. That is a separate
integration boundary documented in `docs/platform/action-dispatch-reliability.md`.
