/**
 * Scenario Engine — PR-11
 *
 * ScenarioProvider over an already-parsed JSON value (e.g. from a
 * user-selected file read via FileReader in the browser). Runs the
 * exact same validation as BuiltinScenarioProvider, so a user JSON
 * file is held to the same contract as the built-in one.
 */
import type { ScenarioProvider } from "./ScenarioProvider";
import type { ScenarioSet } from "./ScenarioSet";
export declare class JsonScenarioProvider implements ScenarioProvider {
    private readonly raw;
    constructor(raw: unknown);
    load(): Promise<ScenarioSet>;
}
//# sourceMappingURL=JsonScenarioProvider.d.ts.map