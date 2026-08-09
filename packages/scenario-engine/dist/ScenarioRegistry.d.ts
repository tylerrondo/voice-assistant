/**
 * Scenario Engine
 *
 * Holds registered scenarios, keyed by their trigger action type.
 *
 * Contains no execution logic — only storage and lookup.
 * Execution is the responsibility of ScenarioEngine.
 */
import type { Scenario } from "./Scenario";
export declare class ScenarioRegistry {
    private readonly scenarios;
    register(scenario: Scenario): void;
    unregister(trigger: string): void;
    /**
     * PR-11: removes every registered scenario. Used when switching
     * the active ScenarioSet (e.g. Built-in -> JSON File) so the
     * registry only ever reflects one ScenarioSet at a time.
     */
    clear(): void;
    find(trigger: string): Scenario | undefined;
    list(): ReadonlyArray<Scenario>;
}
//# sourceMappingURL=ScenarioRegistry.d.ts.map