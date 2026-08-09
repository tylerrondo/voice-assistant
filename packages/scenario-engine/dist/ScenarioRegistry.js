/**
 * Scenario Engine
 *
 * Holds registered scenarios, keyed by their trigger action type.
 *
 * Contains no execution logic — only storage and lookup.
 * Execution is the responsibility of ScenarioEngine.
 */
export class ScenarioRegistry {
    scenarios = new Map();
    register(scenario) {
        this.scenarios.set(scenario.trigger, scenario);
    }
    unregister(trigger) {
        this.scenarios.delete(trigger);
    }
    /**
     * PR-11: removes every registered scenario. Used when switching
     * the active ScenarioSet (e.g. Built-in -> JSON File) so the
     * registry only ever reflects one ScenarioSet at a time.
     */
    clear() {
        this.scenarios.clear();
    }
    find(trigger) {
        return this.scenarios.get(trigger);
    }
    list() {
        return Array.from(this.scenarios.values());
    }
}
//# sourceMappingURL=ScenarioRegistry.js.map