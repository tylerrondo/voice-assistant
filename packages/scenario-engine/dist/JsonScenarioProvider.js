/**
 * Scenario Engine — PR-11
 *
 * ScenarioProvider over an already-parsed JSON value (e.g. from a
 * user-selected file read via FileReader in the browser). Runs the
 * exact same validation as BuiltinScenarioProvider, so a user JSON
 * file is held to the same contract as the built-in one.
 */
import { validateScenarioSet } from "./ScenarioSetValidator";
export class JsonScenarioProvider {
    raw;
    constructor(raw) {
        this.raw = raw;
    }
    async load() {
        return validateScenarioSet(this.raw);
    }
}
//# sourceMappingURL=JsonScenarioProvider.js.map