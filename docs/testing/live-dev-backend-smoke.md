# Live dev backend smoke test

This is a manual, read-only integration check for the nanny UI's
`NannyCustomerSessionClient`. It tests the same customer login/token endpoints used by
the demo and does not send reports, send email, call `nanny_pricing`, or create orders.

## GitHub Actions setup

Add these repository Actions secrets:

- `DEV_BACKEND_URL`: HTTPS URL including the application path, for example
  `https://ibronevik.ru/taxi_dev2/c/children` (without `/api/v1`)
- `DEV_BACKEND_LOGIN`: dedicated test-customer login
- `DEV_BACKEND_PASSWORD`: dedicated test-customer password

Run **Actions → Live dev backend smoke test → Run workflow**. The live job is
manual-only; credentials are never required or exposed to pull-request code.

## Checks performed

1. `POST /api/v1/auth/login` with `type=e-mail`.
2. `POST /api/v1/token` using the returned `auth_hash`.
3. Confirms the response contains a token and `u_hash`, without logging either value.

A passing result confirms only customer authentication/token issuance. It does **not**
confirm that the `nanny_pricing` quote or booking contract works. The smoke test
intentionally stops before any endpoint that could create a booking. The live run must
use a dedicated test-customer account and must not be treated as evidence of the full
nanny-order integration.
