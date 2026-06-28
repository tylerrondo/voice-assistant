/**
 * Scenario Engine
 *
 * Takes an InteractionAction and a ScenarioRegistry, and produces
 * a sequence of InteractionEvent according to the matching scenario.
 *
 * Does NOT know about:
 *  - Voice
 *  - Browser
 *  - Taxi
 *  - FSM
 *  - React
 *
 * If no scenario matches the action, a generic fallback event is
 * produced (mirrors the previous EmulatorScenario default).
 */

import type { InteractionAction } from "../../interaction-contract/dist/index"
import type { Scenario, ScenarioEvent } from "./Scenario"
import type { ScenarioRegistry } from "./ScenarioRegistry"

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ScenarioEngine {

    constructor(private readonly registry: ScenarioRegistry) {}

    /**
     * Runs the scenario matching the action's type and yields
     * each emitted event in order, honoring "delay" steps between
     * them. If no scenario is registered for this action type,
     * yields a single generic fallback event.
     */
    async *run(action: InteractionAction): AsyncGenerator<ScenarioEvent> {

        const scenario: Scenario | undefined =
            this.registry.find(action.type)

        if (!scenario) {
            yield {
                type: "interaction.unhandled-action",
                payload: { receivedType: action.type }
            }
            return
        }

        for (const step of scenario.steps) {

            switch (step.kind) {

                case "emit":
                    yield step.event
                    break

                case "delay":
                    await delay(step.ms)
                    break

                case "end":
                    return

            }

        }

    }

}