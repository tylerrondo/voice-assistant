/**
 * Scenario Engine — PR-11
 *
 * Validates an arbitrary JSON value against the ScenarioSet contract
 * before it is allowed anywhere near the Runner. This is the single
 * gatekeeper both BuiltinScenarioProvider and JsonScenarioProvider
 * go through, so Built-in and JSON File scenarios are held to
 * exactly the same rules.
 *
 * On success, returns a typed ScenarioSet.
 * On failure, throws ScenarioSetValidationError with a human-readable
 * message describing exactly what was wrong (used by the UI to block
 * Run All / Interactive and show the tester why).
 */
import type { ScenarioSet } from "./ScenarioSet";
export declare class ScenarioSetValidationError extends Error {
    constructor(message: string);
}
export declare function validateScenarioSet(raw: unknown): ScenarioSet;
//# sourceMappingURL=ScenarioSetValidator.d.ts.map