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
import type { Scenario } from "./Scenario";
import type { ScenarioRegistry } from "./ScenarioRegistry";
import type { ScenarioSet, ScenarioSetEntry } from "./ScenarioSet";
export declare function toScenario(entry: ScenarioSetEntry): Scenario;
export declare function toScenarios(set: ScenarioSet): ReadonlyArray<Scenario>;
/**
 * Replaces the registry's contents with the scenarios from `set`.
 * Automatic and Interactive both read from the same registry, so
 * this is the one place a ScenarioSet becomes "active".
 */
export declare function loadScenarioSetIntoRegistry(registry: ScenarioRegistry, set: ScenarioSet): void;
//# sourceMappingURL=ScenarioSetLoader.d.ts.map