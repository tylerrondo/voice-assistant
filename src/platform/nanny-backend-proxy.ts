import type {
  ActionExecution,
  DialogueContext,
  DispatchResult,
} from './dialogue-manager';
import {
  createNannyBackendActionDispatcher,
  type NannyBackendDispatcherConfig,
} from './nanny-backend-action-dispatcher';

export interface NannyProxyRequest {
  event: { type: string; payload: Record<string, any> };
  context: DialogueContext;
  execution: ActionExecution;
}

export interface AuthenticatedNannyProxySession {
  ownerId: string;
  sessionId: string;
}

export interface NannyProxyDependencies {
  /** Validate the real host session (cookie/Bearer token); never trust IDs in the JSON body. */
  authenticate(request: Request): Promise<AuthenticatedNannyProxySession | null>;
  /** Resolve the authenticated platform identity to one real MultiBot customer identity field. */
  resolveCustomerIdentity(session: AuthenticatedNannyProxySession): Promise<Record<string, string>>;
  /** Use a configured geocoder and trusted timezone/date resolver; never return guessed coordinates. */
  resolveBookingLocation(
    payload: Record<string, any>,
    context: DialogueContext,
  ): ReturnType<NannyBackendDispatcherConfig['resolveBookingLocation']>;
  /** Resolve the selected display candidate against a trusted backend nanny catalog. */
  resolveSelectedNanny(
    payload: Record<string, any>,
    context: DialogueContext,
  ): ReturnType<NannyBackendDispatcherConfig['resolveSelectedNanny']>;
  /** Server-only MultiBot credentials. Never serialize these into browser configuration. */
  backend: Pick<NannyBackendDispatcherConfig, 'baseUrl' | 'session' | 'fetchImpl'>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Server-side handler to mount at POST /api/nanny/dispatch.
 * Host authentication, customer identity, geocoding, and nanny catalog resolution are
 * injected explicitly. The handler fails closed if any resolver is unavailable.
 */
export function createNannyBackendProxyHandler(deps: NannyProxyDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return json({ status: 'FAILED', errorCode: 'METHOD_NOT_ALLOWED' }, 405);
    }

    const session = await deps.authenticate(request).catch(() => null);
    if (!session || !session.ownerId || !session.sessionId) {
      return json({ status: 'FAILED', errorCode: 'UNAUTHENTICATED' }, 401);
    }

    let body: NannyProxyRequest;
    try {
      body = await request.json() as NannyProxyRequest;
    } catch {
      return json({ status: 'FAILED', errorCode: 'INVALID_JSON' }, 400);
    }

    if (!body || body.event?.type !== 'nanny.order.confirmed' ||
        !body.event.payload || typeof body.event.payload !== 'object' ||
        !body.context || !body.execution) {
      return json({ status: 'FAILED', errorCode: 'INVALID_REQUEST' }, 400);
    }

    // Body identity fields are not authentication. Bind them to the verified host session.
    if (body.execution.ownerId !== session.ownerId || body.execution.sessionId !== session.sessionId ||
        body.context.ownerId !== session.ownerId || body.context.sessionId !== session.sessionId) {
      return json({ status: 'FAILED', errorCode: 'SESSION_IDENTITY_MISMATCH' }, 403);
    }

    try {
      // Construct per request: resolver closure is scoped to this authenticated session,
      // avoiding cross-user state or a shared/global customer ID under concurrent requests.
      const customerIdentity = await deps.resolveCustomerIdentity(session);
      const dispatcher = createNannyBackendActionDispatcher({
        ...deps.backend,
        resolveCustomerIdentity: async () => customerIdentity,
        resolveBookingLocation: deps.resolveBookingLocation,
        resolveSelectedNanny: deps.resolveSelectedNanny,
      });
      const result: DispatchResult = await dispatcher(body.event, body.context, body.execution);
      const status = result.status === 'FAILED' ? 422 : result.status === 'UNKNOWN' ? 202 : 200;
      return json(result, status);
    } catch {
      return json({
        status: 'FAILED',
        executionId: body.execution.executionId,
        attempt: body.execution.attempt,
        errorCode: 'NANNY_PROXY_INTERNAL_ERROR',
      }, 500);
    }
  };
}
