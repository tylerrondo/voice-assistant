/**
 * Scenario Engine
 *
 * Describes one step inside a Scenario.
 *
 * A step can:
 *  - emit an InteractionEvent ("emit")
 *  - wait for a fixed delay before continuing ("delay")
 *  - explicitly end the scenario early ("end")
 *
 * Steps are plain data. They contain no execution logic of their own;
 * interpretation happens in ScenarioEngine.
 */

import type { ScenarioEvent } from "./Scenario"

export interface EmitStep {
    readonly kind: "emit"
    readonly event: ScenarioEvent
}

export interface DelayStep {
    readonly kind: "delay"
    readonly ms: number
}

export interface EndStep {
    readonly kind: "end"
}

export type ScenarioStep = EmitStep | DelayStep | EndStep