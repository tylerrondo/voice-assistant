/**
 * Scenario Engine
 *
 * Holds registered scenarios, keyed by their trigger action type.
 *
 * Contains no execution logic — only storage and lookup.
 * Execution is the responsibility of ScenarioEngine.
 */

import type { Scenario } from "./Scenario"

export class ScenarioRegistry {

    private readonly scenarios = new Map<string, Scenario>()

    register(scenario: Scenario): void {
        this.scenarios.set(scenario.trigger, scenario)
    }

    unregister(trigger: string): void {
        this.scenarios.delete(trigger)
    }

    find(trigger: string): Scenario | undefined {
        return this.scenarios.get(trigger)
    }

    list(): ReadonlyArray<Scenario> {
        return Array.from(this.scenarios.values())
    }

}