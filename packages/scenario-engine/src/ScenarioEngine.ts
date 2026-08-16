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
 *
 * PR-9d.2: if the incoming action carries recognized text
 * (action.payload.text, as produced by a real RecognitionProvider),
 * that text is automatically attached as `recognizedText` on every
 * emitted event's payload. This lets simple default scenarios (like
 * voice-recognized-ok) speak back what the user actually said,
 * without needing a full intent/template resolution layer.
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

        const recognizedText = this.extractRecognizedText(action)

        for (const step of scenario.steps) {
            switch (step.kind) {
                case "emit":
                    yield this.withRecognizedText(step.event, recognizedText)
                    break
                case "delay":
                    await this.delayProvider.wait(step.ms)
                    break
                case "end":
                    return
            }
        }

    }

    private extractRecognizedText(action: InteractionAction): string | undefined {
        const payload = (action as any).payload
        return payload && typeof payload.text === "string" ? payload.text : undefined
    }

    private withRecognizedText(event: ScenarioEvent, recognizedText: string | undefined): ScenarioEvent {
        if (!recognizedText) {
            return event
        }
        return {
            ...event,
            payload: {
                ...(event.payload ?? {}),
                recognizedText
            }
        }
    }

}