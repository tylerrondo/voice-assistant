/**
 * Voice Emulator
 *
 * Holds pre-defined responses to incoming actions.
 */

import type { InteractionAction, InteractionEvent } from "../../interaction-contract/dist/index"

export type ScenarioHandler = (
    action: InteractionAction
) => Omit<InteractionEvent, "metadata">

export class EmulatorScenario {

    private readonly handlers =
        new Map<string, ScenarioHandler>()

    register(actionType: string, handler: ScenarioHandler): void {
        this.handlers.set(actionType, handler)
    }

    resolve(action: InteractionAction): Omit<InteractionEvent, "metadata"> {

        const handler = this.handlers.get(action.type)

        if (handler) {
            return handler(action)
        }

        return {
            type: "interaction.unhandled-action",
            payload: { receivedType: action.type }
        }

    }

}