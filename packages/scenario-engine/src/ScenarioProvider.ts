/**
 * Scenario Engine — PR-11
 *
 * Source-agnostic contract for obtaining a ScenarioSet. The Runner
 * (ScenarioEngine/ScenarioRegistry) never talks to a ScenarioProvider
 * directly and knows nothing about where scenarios came from — see
 * ScenarioSetLoader for the piece that turns a loaded ScenarioSet
 * into registered Scenario entries.
 */

import type { ScenarioSet } from "./ScenarioSet"

export interface ScenarioProvider {
    load(): Promise<ScenarioSet>
}
