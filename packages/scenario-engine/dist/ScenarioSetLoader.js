/**
 * Scenario Engine — PR-11
 *
 * Bridges the external ScenarioSet JSON contract and the internal
 * Scenario model the Runner already understands. Only `activation`
 * (or the legacy `trigger`) and `steps` are used — everything else
 * on a ScenarioSetEntry (id, description, category, difficulty,
 * expectedPhrase, aliases, ...) is metadata for other consumers
 * (Driver Training, Certification, Analytics) and is intentionally
 * dropped here. The Runner itself does not change.
 */
function resolveTrigger(entry) {
    // v2: activation.value wins if present; v1: fall back to trigger.
    return entry.activation?.value ?? entry.trigger ?? "";
}
export function toScenario(entry) {
    return {
        name: entry.name,
        trigger: resolveTrigger(entry),
        steps: entry.steps
    };
}
export function toScenarios(set) {
    return set.scenarios.map(toScenario);
}
/**
 * Replaces the registry's contents with the scenarios from `set`.
 * Automatic and Interactive both read from the same registry, so
 * this is the one place a ScenarioSet becomes "active".
 */
export function loadScenarioSetIntoRegistry(registry, set) {
    registry.clear();
    for (const scenario of toScenarios(set)) {
        registry.register(scenario);
    }
}
//# sourceMappingURL=ScenarioSetLoader.js.map