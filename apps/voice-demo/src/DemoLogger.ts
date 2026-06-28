/**
 * Voice Demo
 *
 * Records the Action/Event/Speak stream into the shared
 * ExecutionLog, instead of writing to console directly.
 *
 * Pure debugging aid -- contains no business logic. Where output
 * actually ends up (console, DOM, memory) is decided by whichever
 * LogSink implementations are registered on the log/dispatcher in
 * Bootstrap -- this class only knows how to describe what happened.
 */

import type {
    InteractionAction,
    InteractionEvent
} from "../../../packages/interaction-contract/dist/index"

import type { ExecutionLog } from "../../../packages/execution-log/dist/index"

export class DemoLogger {

    constructor(private readonly log: ExecutionLog) {}

    logAction(action: InteractionAction): void {
        this.log.append("action", { type: action.type })
    }

    logEvent(event: InteractionEvent): void {
        this.log.append("event", { type: event.type })
    }

    logSpeak(text: string): void {
        this.log.append("speak", { text })
    }

}