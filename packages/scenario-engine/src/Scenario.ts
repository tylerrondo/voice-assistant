/**
 * Scenario Engine
 *
 * Describes one declarative scenario: which incoming action
 * triggers it, and what sequence of steps it produces.
 *
 * A Scenario is plain data. It contains no execution logic.
 */

import type { InteractionEvent } from "../../interaction-contract/dist/index"
import type { ScenarioStep } from "./ScenarioStep"

export interface Scenario {
    /** Human-readable name, used for registry lookup/listing. */
    readonly name: string

    /** InteractionAction.type that triggers this scenario. */
    readonly trigger: string

    /** Ordered list of steps to execute when triggered. */
    readonly steps: ReadonlyArray<ScenarioStep>
}

/** Convenience type for an event emitted by a scenario step. */
export type ScenarioEvent = Omit<InteractionEvent, "metadata">