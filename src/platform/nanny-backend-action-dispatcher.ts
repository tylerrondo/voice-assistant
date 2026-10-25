import type {
  ActionDispatcher,
  ActionExecution,
  DialogueContext,
  DispatchResult,
} from './dialogue-manager';

export interface NannyBookingLocation {
  latitude: number;
  longitude: number;
  /** IANA timezone for the booking location, e.g. Europe/Madrid. */
  timeZone: string;
  /** Start instant resolved from the scenario's date and start_time slots. */
  when: Date;
}

export interface NannyBackendDispatcherConfig {
  /** Full API base, including /api/v1 (e.g. https://host/taxi_dev2/c/children/api/v1). */
  baseUrl: string;
  /** Existing authenticated backend session. Never put administrator credentials here. */
  session: { token: string; u_hash: string };
  /** Resolve the current customer's API identity per session; never share a global customer ID. */
  resolveCustomerIdentity: (
    payload: Record<string, any>,
    context: DialogueContext,
  ) => Promise<Record<string, string>>;
  /** Resolve the scenario's free-text address and local date/time using the app's location service. */
  resolveBookingLocation: (
    payload: Record<string, any>,
    context: DialogueContext,
  ) => Promise<NannyBookingLocation>;
  /** Resolve the selected scenario candidate to a real backend driver/user ID. */
  resolveSelectedNanny: (
    payload: Record<string, any>,
    context: DialogueContext,
  ) => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

type CreateOrderResponse = {
  status?: string;
  code?: string;
  message?: unknown;
  data?: { b_id?: number | string; duplicate?: boolean };
};

function failed(execution: ActionExecution, errorCode: string): DispatchResult {
  return {
    status: 'FAILED',
    executionId: execution.executionId,
    attempt: execution.attempt,
    errorCode,
  };
}

/**
 * Real adapter for the existing MultiBot children API.
 *
 * Only confirmed nanny bookings are accepted. Unknown transport outcomes stay UNKNOWN
 * because the server may have committed the order before the connection failed.
 * The backend's request_key makes a later reconciliation/retry safe from duplicate orders.
 */
export function createNannyBackendActionDispatcher(
  config: NannyBackendDispatcherConfig,
): ActionDispatcher {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;

  return async (event, context, execution) => {
    if (event.type !== 'nanny.order.confirmed') {
      return failed(execution, 'UNSUPPORTED_BACKEND_ACTION');
    }

    if (!config.session.token || !config.session.u_hash) {
      return failed(execution, 'BACKEND_SESSION_REQUIRED');
    }
    const payload = execution.payload;
    let customerIdentity: Record<string, string>;
    try {
      customerIdentity = await config.resolveCustomerIdentity(payload, context);
    } catch {
      return failed(execution, 'CUSTOMER_IDENTITY_RESOLUTION_FAILED');
    }
    if (!customerIdentity || Object.keys(customerIdentity).length !== 1 ||
        !Object.values(customerIdentity)[0]) {
      return failed(execution, 'CUSTOMER_IDENTITY_REQUIRED');
    }
    const childrenCount = Number(payload.children_count);
    if (!Number.isInteger(childrenCount) || childrenCount < 1) {
      return failed(execution, 'INVALID_CHILDREN_COUNT');
    }

    const startTime = String(payload.start_time ?? '');
    const endTime = String(payload.end_time ?? '');
    const durationHours = durationHoursBetween(startTime, endTime);
    if (durationHours === null) {
      return failed(execution, 'INVALID_BOOKING_TIME_RANGE');
    }

    let location: NannyBookingLocation;
    try {
      location = await config.resolveBookingLocation(payload, context);
    } catch {
      return failed(execution, 'LOCATION_RESOLUTION_FAILED');
    }
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) ||
        !location.timeZone || Number.isNaN(location.when.getTime())) {
      return failed(execution, 'INVALID_RESOLVED_BOOKING_LOCATION');
    }

    let selectedNannyId: string | null;
    try {
      selectedNannyId = await config.resolveSelectedNanny(payload, context);
    } catch {
      return failed(execution, 'SELECTED_NANNY_RESOLUTION_FAILED');
    }
    if (!selectedNannyId?.trim()) {
      return failed(execution, 'SELECTED_NANNY_NOT_RESOLVED');
    }

    const formatUtc = (date: Date) => {
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+00:00`;
    };

    const start = location.when;
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    const order: Record<string, any> = {
      b_start_latitude: String(location.latitude),
      b_start_longitude: String(location.longitude),
      b_start_datetime: formatUtc(start),
      b_passengers_count: childrenCount,
      b_max_waiting: 3600,
      b_payment_way: 1,
      b_services: [],
      b_comments: [],
      b_only_offer: 1,
      b_options: {
        submitPrice: 0,
        createdBy: 'voice-assistant',
        childrenProfiles: String(childrenCount),
        b_end_datetime: formatUtc(end),
        childrenAges: String(payload.children_ages ?? ''),
        requirements: String(payload.requirements ?? ''),
      },
    };

    const form = new URLSearchParams({
      token: config.session.token,
      u_hash: config.session.u_hash,
      is_var: '1',
      s_t_data: JSON.stringify({
        action: 'create',
        request_key: execution.idempotencyKey,
        time_zone: location.timeZone,
        order,
      }),
      ...customerIdentity,
      u_a_role: '1',
    });

    let response: Response;
    let body: CreateOrderResponse;
    try {
      response = await fetchImpl(`${baseUrl}/script/template/nanny_pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: form,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return {
        status: 'UNKNOWN',
        executionId: execution.executionId,
        attempt: execution.attempt,
        errorCode: 'NETWORK_ERROR',
      };
    }

    try {
      body = await response.json() as CreateOrderResponse;
    } catch {
      return response.ok
        ? {
            status: 'UNKNOWN',
            executionId: execution.executionId,
            attempt: execution.attempt,
            errorCode: 'INVALID_BACKEND_RESPONSE',
          }
        : failed(execution, 'BACKEND_HTTP_ERROR');
    }

    if (!response.ok || body.status !== 'success') {
      return failed(execution, 'BACKEND_REJECTED_ORDER');
    }

    const orderId = body.data?.b_id;
    if (orderId === undefined || orderId === null || String(orderId).trim() === '') {
      return {
        status: 'UNKNOWN',
        executionId: execution.executionId,
        attempt: execution.attempt,
        errorCode: 'ORDER_ID_MISSING_FROM_RESPONSE',
      };
    }

    // MultiBot creates the booking first, then assigns the selected nanny via drive/get/{id}.
    // Always repeat this idempotent assignment after create, including duplicate-create responses,
    // so a retry can recover if the first assignment response was lost.
    const offerForm = new URLSearchParams({
      token: config.session.token,
      u_hash: config.session.u_hash,
      action: 'set_offer',
      u_id: selectedNannyId,
      u_a_role: '1',
      ...customerIdentity,
    });
    try {
      const offerResponse = await fetchImpl(`${baseUrl}/drive/get/${encodeURIComponent(String(orderId))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: offerForm,
        signal: AbortSignal.timeout(10000),
      });
      let offerBody: { status?: string } | undefined;
      try {
        offerBody = await offerResponse.json() as { status?: string };
      } catch {
        offerBody = undefined;
      }
      if (!offerResponse.ok || offerBody?.status !== 'success') {
        return {
          status: 'UNKNOWN',
          executionId: execution.executionId,
          attempt: execution.attempt,
          errorCode: 'ORDER_CREATED_OFFER_UNKNOWN',
        };
      }
    } catch {
      return {
        status: 'UNKNOWN',
        executionId: execution.executionId,
        attempt: execution.attempt,
        errorCode: 'ORDER_CREATED_OFFER_UNKNOWN',
      };
    }

    return {
      status: 'SUCCEEDED',
      executionId: execution.executionId,
      attempt: execution.attempt,
    };
  };
}

function durationHoursBetween(start: string, end: string): number | null {
  const matchTime = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const startMinutes = matchTime(start);
  const endMinutes = matchTime(end);
  if (startMinutes === null || endMinutes === null) return null;
  const duration = (endMinutes - startMinutes + 1440) % 1440;
  if (duration <= 0) return null;
  return duration / 60;
}
