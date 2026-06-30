/**
 * Verification Harness
 *
 * Verifies a VerificationScenario by checking the sequence of
 * entries in an ExecutionLog against the scenario's expectations.
 *
 * Checks both kind and payload (if provided).
 * Measures duration from first matched entry to last matched entry,
 * not from verification start.
 * Never writes to ExecutionLog -- only reads it.
 */
import type { ExecutionLog } from "../../execution-log/dist/index";
import type { VerificationScenario } from "./VerificationScenario";
import type { VerificationResult } from "./VerificationResult";
export declare class ScenarioVerifier {
    private readonly log;
    constructor(log: ExecutionLog);
    verify(scenario: VerificationScenario): VerificationResult;
    /**
     * Partial match: every key present in `expected` must match in `actual`.
     * Extra keys in `actual` are ignored. This allows expectations like
     * { type: "voice.recognized" } to match a richer actual payload.
     */
    private payloadMatches;
    private findNextMatch;
}
//# sourceMappingURL=ScenarioVerifier.d.ts.map