/**
 * Scenario Engine — PR-11
 *
 * ScenarioProvider over an already-parsed JSON value (e.g. from a
 * user-selected file read via FileReader in the browser). Runs the
 * exact same validation as BuiltinScenarioProvider, so a user JSON
 * file is held to the same contract as the built-in one.
 */

import type { ScenarioProvider } from "./ScenarioProvider"
import type { ScenarioSet } from "./ScenarioSet"
import { validateScenarioSet } from "./ScenarioSetValidator"

export class JsonScenarioProvider implements ScenarioProvider {

    constructor(private readonly raw: unknown) {}

    async load(): Promise<ScenarioSet> {
        return validateScenarioSet(this.raw)
    }

}
