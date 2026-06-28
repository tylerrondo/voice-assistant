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
 *  - real time (delegated entirely to DelayProvider)
 *
 * If no scenario matches the action, a generic fallback event is
 * produced (mirrors the previous EmulatorScenario default).
 */

import type { InteractionAction } from "../../interaction-contract/dist/index"
import type { Scenario, ScenarioEvent } from "./Scenario"
import type { ScenarioRegistry } from "./ScenarioRegistry"
import type { DelayProvider } from "./DelayProvider"
import { RealTimeDelayProvider } from "./DelayProvider"

export class ScenarioEngine {

    private readonly delayProvider: DelayProvider

    constructor(
        private readonly registry: ScenarioRegistry,
        delayProvider: DelayProvider = new RealTimeDelayProvider()
    ) {
        this.delayProvider = delayProvider
    }

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
                    await this.delayProvider.wait(step.ms)
                    break
                case "end":
                    return
            }
        }

    }

}