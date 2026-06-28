/**
 * Validation Bench
 *
 * Logs actions, events and speak calls into ExecutionLog.
 */

import type { InteractionAction, InteractionEvent } from "../../../packages/interaction-contract/dist/index"
import type { ExecutionLog } from "../../../packages/execution-log/dist/index"

export class DemoLogger {

    constructor(private readonly log: ExecutionLog) {}

    logAction(action: InteractionAction): void {
        this.log.append("Action", { type: action.type, payload: action.payload })
    }

    logEvent(event: InteractionEvent): void {
        this.log.append("Event", { type: event.type, payload: event.payload })
    }

    logSpeak(text: string): void {
        this.log.append("Speak", { text })
    }

}