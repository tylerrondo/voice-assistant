# Nanny backend ActionDispatcher integration

The production dispatcher routes `nanny.order.confirmed` to the existing MultiBot children API adapter. Other events retain their existing dispatcher path.

## API contract

- Base URL is the full API base, including `/api/v1` (for example, the isolated dev2 `/taxi_dev2/c/children/api/v1` path).
- Order creation uses `POST /script/template/nanny_pricing` with form fields `token`, `u_hash`, `is_var=1`, `s_t_data`, the customer identity field and `u_a_role=1`.
- `s_t_data` uses the established MultiBot contract: `action: "create"`, `request_key`, `time_zone`, and the `order` object. The order is restricted to the resolved selected nanny (`b_only_offer=1`), followed by `POST /drive/get/{orderId}` with `action=set_offer` and the resolved backend nanny ID.
- `request_key` is a deterministic 16-hex-character hash of the platform `idempotencyKey`, prefixed with `va_` to satisfy MultiBot's 8–64 character `[A-Za-z0-9_-]` validation. A transport failure returns `UNKNOWN`, not a false failure, because the backend may already have committed the order.

## Customer authentication client

`src/platform/nanny-customer-session.ts` adds an in-memory customer session client. The voice runtime now exposes a customer login form and passes the resulting session to the nanny dispatcher; logout clears the in-memory session. Login uses the Universal API `/auth/login` → `/token` sequence relative to the configured API base, validates `status: success`, and never falls back to a preconfigured service/admin session. Tokens are not persisted in browser storage. Contract tests cover the request sequence, response status, memory-only session lifecycle, and HTTPS enforcement.

**Contract evidence:** the tracked Universal API dispatcher `public_html/taxi/controllers/c_api.php` exposes `par[1] == 'auth'` and calls `authUser(login, password, type)`; it does not expose an `auth/login` sub-route. The existing Validation Bench `BackendClient.ts` also uses `/api/v1/auth/login` → `/api/v1/token`. The helper and contract test now use `/auth`. The exact dev2 deployment and live response shape still require a safe read-only check. The login helper is wired into the voice UI; the order dispatcher still requires the host to provide trusted customer identity, location and selected-nanny resolvers.

## Host configuration

The host auth/location layer must provide the dispatcher configuration before a confirmed nanny order is dispatched. The voice runtime login uses `window.__NANNY_BACKEND_CONFIG__.baseUrl` when supplied, otherwise the isolated dev2 base URL. The dispatcher requires `window.__NANNY_BACKEND_CONFIG__` and `window.__NANNY_CUSTOMER_SESSION__`; login alone is not sufficient to create an order. The host configuration must provide:

- `baseUrl`: dev2 API base, not the production API.
- `session`: an already authenticated `{ token, u_hash }` session. These values are credentials too: do not expose an administrator/service-account token or hash to browser code. For privileged MultiBot credentials, the dispatcher must be hosted behind a server-side proxy; only a scoped customer session may be used directly in the browser.
- `resolveCustomerIdentity(payload, context)`: return exactly one customer identity field accepted by the API, such as `{ u_a_tg }` or `{ chatId }`, derived from the authenticated session. Do not use a single global customer ID for all sessions.
- `resolveBookingLocation(payload, context)`: resolve the free-text location and local date/time to coordinates, an IANA timezone, and the booking start instant. This must use the real geocoding/location provider; a typed address alone is not enough.
- `resolveSelectedNanny(payload, context)`: map the chosen scenario candidate to the real backend nanny/user ID. A display-only candidate ID must not be sent to the API.
- `payload.additional_options` (when present): IDs from the live backend booking-options catalog. Free-text requirements are stored separately in `b_options.requirements` and are not sent as price option IDs.

If the host configuration is missing, the dispatcher returns `NANNY_BACKEND_NOT_CONFIGURED`; it does not silently report a successful local FSM transition for a nanny booking. If location or selected-nanny resolution is unavailable, it fails before creating an order. If creation succeeds but assignment of the selected nanny cannot be confirmed, it returns `UNKNOWN` to prevent a retry from creating a second booking.

## Verification boundary

The contract tests verify request mapping and failure semantics without creating a live order. The MultiBot read-only smoke run from 2026-10-24 remains the evidence for backend authentication, data reads and nanny pricing; it did not exercise order creation. No live order has been created by this integration change. The adapter is not production-ready until the host supplies real customer identity, location/geocoding and selected-nanny resolvers, and the credential boundary is confirmed.
