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
- `DEV_BACKEND_TEST_LATITUDE` (optional): override latitude for a dedicated dev2 test point
- `DEV_BACKEND_TEST_LONGITUDE` (optional): override longitude for that same point

By default, the read-only lookup uses Malaga city centre (`36.7213, -4.4214`), where nannies are available.

Run **Actions → Live dev backend smoke test → Run workflow**. The live job is
manual-only; credentials are never required or exposed to pull-request code.

## Checks performed

1. `POST /api/v1/auth/login` with `type=e-mail`.
2. `POST /api/v1/token` using the returned `auth_hash`.
3. Confirms the response contains a token, `u_hash`, and authenticated customer ID, without logging values.
4. Calls `POST /api/v1/query/template/1` with the customer token and Malaga coordinates by default (or optional configured test coordinates).
5. If city IDs are returned, calls `POST /api/v1/query/template/2` with the same customer token and checks that returned candidates include backend IDs.

The lookup endpoints are read-only. No admin role or service credentials are sent, and the
smoke test never calls `nanny_pricing` or `drive/get`, so it cannot create or assign an order.
A passing result confirms customer-session access to location/candidate lookup, but does **not**
confirm the `nanny_pricing` quote or booking contract. Use a dedicated test-customer account.
