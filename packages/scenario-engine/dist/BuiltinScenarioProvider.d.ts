/**
 * Scenario Engine — PR-11
 *
 * Minimal ScenarioProvider that reads the built-in scenario set from
 * scenarios/builtin.json. This is the only file that knows the
 * built-in scenarios live in JSON now — the Runner does not.
 */
import type { ScenarioProvider } from "./ScenarioProvider";
import type { ScenarioSet } from "./ScenarioSet";
/**
 * Synchronous helper used where an async load() is inconvenient
 * (e.g. wiring up the registry at app bootstrap). Goes through the
 * same validation as any external file, so a broken builtin.json
 * fails loudly instead of silently.
 */
export declare function loadBuiltinScenarioSet(): ScenarioSet;
export declare class BuiltinScenarioProvider implements ScenarioProvider {
    load(): Promise<ScenarioSet>;
}
//# sourceMappingURL=BuiltinScenarioProvider.d.ts.map