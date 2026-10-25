# Nanny backend ActionDispatcher integration

The production dispatcher routes `nanny.order.confirmed` to the existing MultiBot children API adapter. Other events retain their existing dispatcher path.

## API contract

- Base URL is the full API base, including `/api/v1` (for example, the isolated dev2 `/taxi_dev2/c/children/api/v1` path).
- Order creation uses `POST /script/template/nanny_pricing` with form fields `token`, `u_hash`, `is_var=1`, `s_t_data`, the customer identity field and `u_a_role=1`.
- `s_t_data` uses the established MultiBot contract: `action: "create"`, `request_key`, `time_zone`, and the `order` object. The order is restricted to the resolved selected nanny (`b_only_offer=1`), followed by `POST /drive/get/{orderId}` with `action=set_offer` and the resolved backend nanny ID.
- `request_key` is a deterministic 16-hex-character hash of the platform `idempotencyKey`, prefixed with `va_` to satisfy MultiBot's 8–64 character `[A-Za-z0-9_-]` validation. A transport failure returns `UNKNOWN`, not a false failure, because the backend may already have committed the order.

## Server-side proxy boundary

The browser now posts confirmed bookings to `POST /api/nanny/dispatch` (override with `window.__NANNY_BACKEND_PROXY_URL__` only when the host uses another same-origin route). It does not receive MultiBot credentials. `src/platform/nanny-backend-proxy.ts` exports `createNannyBackendProxyHandler`, a server-runtime handler that checks the host-authenticated session against the execution identity and calls the adapter with server-held credentials. Mount this handler in the host's server/router layer; the repository's current Vite demo is static and does not itself provide a deployable API route.

The server handler deliberately requires the deployment to supply these trusted dependencies:

- `backend.baseUrl`: dev2 API base, not the production API.
- `backend.session`: server-only MultiBot credentials. Do not serialize them into browser configuration.
- `authenticate(request)`: verify the actual host session (cookie/Bearer token); request-body IDs are never accepted as authentication.
- `resolveCustomerIdentity(session)`: return exactly one accepted customer identity field derived from the authenticated session. Do not use a global customer ID.
- `resolveBookingLocation(payload, context)`: use the deployment's real geocoder and date/time resolver to return coordinates, IANA timezone, and booking start instant.
- `resolveSelectedNanny(payload, context)`: map the selected display candidate against a trusted backend nanny catalog to the real backend user ID.
- `payload.additional_options` (when present): IDs from the live backend booking-options catalog. Free-text requirements are stored separately in `b_options.requirements` and are not sent as price option IDs.

If the server route is not mounted, the browser returns `NANNY_PROXY_UNREACHABLE`; the static demo does not silently report a successful local FSM transition for a nanny booking. If location or selected-nanny resolution is unavailable, it fails before creating an order. If creation succeeds but assignment of the selected nanny cannot be confirmed, it returns `UNKNOWN` to prevent a retry from creating a second booking.

## Verification boundary

The contract tests verify request mapping and failure semantics without creating a live order. The MultiBot read-only smoke run from 2026-10-24 remains the evidence for backend authentication, data reads and nanny pricing; it did not exercise order creation. No live order has been created by this integration change. The adapter is not production-ready until the host supplies real customer identity, location/geocoding and selected-nanny resolvers, and the credential boundary is confirmed.
