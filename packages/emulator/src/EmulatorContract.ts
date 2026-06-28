/**
 * Voice Emulator
 *
 * Full implementation of InteractionContract for standalone
 * testing of the voice stack, without Taxi/FSM/PHP/Python/backend.
 *
 * As of PR-8, scenario resolution is delegated to ScenarioEngine
 * (see packages/scenario-engine). EmulatorContract no longer knows
 * how scenarios are stored or resolved -- it only consumes the
 * resulting sequence of InteractionEvent.
 */

import type {
    InteractionAction,
    InteractionContract,
    InteractionEvent,
    InteractionSnapshot,
    Unsubscribe
} from "../../interaction-contract/dist/index"

import {
    ScenarioEngine,
    ScenarioRegistry,
    registerBuiltinScenarios
} from "../../scenario-engine/dist/index"

import { EmulatorState } from "./EmulatorState"
import { EmulatorEventBus } from "./EmulatorEventBus"

export class EmulatorContract implements InteractionContract {

    private state: EmulatorState = EmulatorState.Idle

    private revision = 0

    private readonly bus = new EmulatorEventBus()

    private readonly engine: ScenarioEngine

    constructor(
        registry: ScenarioRegistry = EmulatorContract.createDefaultRegistry()
    ) {
        this.engine = new ScenarioEngine(registry)
    }

    /**
     * Default registry, pre-populated with the built-in example
     * scenarios from the scenario-engine package. Consumers that
     * want a clean registry (no examples) can pass their own
     * ScenarioRegistry into the constructor instead.
     */
    private static createDefaultRegistry(): ScenarioRegistry {
        const registry = new ScenarioRegistry()
        registerBuiltinScenarios(registry)
        return registry
    }

    async dispatch<TPayload>(
        action: InteractionAction<TPayload>
    ): Promise<void> {

        this.state = EmulatorState.Processing
        this.revision += 1

        for await (const resolved of this.engine.run(action)) {

            const event: InteractionEvent = {
                ...resolved,
                metadata: {
                    source: "emulator",
                    timestamp: new Date().toISOString()
                }
            }

            this.state = EmulatorState.Responding
            this.bus.publish(event)

        }

        this.state = EmulatorState.Idle

    }

    subscribe(
        listener: (event: InteractionEvent) => void
    ): Unsubscribe {
        return this.bus.subscribe(listener)
    }

    async snapshot(): Promise<InteractionSnapshot> {
        // Minimal snapshot: only what is needed to verify the
        // infrastructure works, not a real domain state model.
        return {
            revision: this.revision,
            state: {
                emulatorState: this.state,
                revision: this.revision
            }
        }
    }

}