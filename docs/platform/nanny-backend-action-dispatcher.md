# Nanny backend ActionDispatcher integration

The production dispatcher routes `nanny.order.confirmed` to the existing MultiBot children API adapter. Other events retain their existing dispatcher path.

## API contract

- Base URL is the full API base, including `/api/v1` (for example, the isolated dev2 `/taxi_dev2/c/children/api/v1` path).
- Order creation uses `POST /script/template/nanny_pricing` with form fields `token`, `u_hash`, `is_var=1`, `s_t_data`, the customer identity field and `u_a_role=1`.
- `s_t_data` uses the established MultiBot contract: `action: "create"`, `request_key`, `time_zone`, and the `order` object. The order is restricted to the resolved selected nanny (`b_only_offer=1`), followed by `POST /drive/get/{orderId}` with `action=set_offer` and the resolved backend nanny ID.
- `request_key` is the stable platform `idempotencyKey`. A transport failure returns `UNKNOWN`, not a false failure, because the backend may already have committed the order.

## Host configuration

The host auth/location layer must set `window.__NANNY_BACKEND_CONFIG__` before a confirmed nanny order is dispatched. It must provide:

- `baseUrl`: dev2 API base, not the production API.
- `session`: an already authenticated `{ token, u_hash }` session. Do not place admin login/password credentials in frontend code or bundle environment variables.
- `customerIdentity`: exactly one customer identity field accepted by the API, such as `{ u_a_tg }` or `{ chatId }`.
- `resolveBookingLocation(payload, context)`: resolve the free-text location and local date/time to coordinates, an IANA timezone, and the booking start instant.
- `resolveSelectedNanny(payload, context)`: map the chosen scenario candidate to the real backend nanny/user ID. A display-only candidate ID must not be sent to the API.

If the host configuration is missing, the dispatcher returns `NANNY_BACKEND_NOT_CONFIGURED`; it does not silently report a successful local FSM transition for a nanny booking. If location or selected-nanny resolution is unavailable, it fails before creating an order. If creation succeeds but assignment of the selected nanny cannot be confirmed, it returns `UNKNOWN` to prevent a retry from creating a second booking.

## Verification boundary

The contract tests verify request mapping and failure semantics without creating a live order. The MultiBot read-only smoke run from 2026-10-24 remains the evidence for backend authentication, data reads and nanny pricing; it did not exercise order creation. No live order has been created by this integration change.
