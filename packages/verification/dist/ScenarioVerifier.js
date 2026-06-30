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
export class ScenarioVerifier {
    log;
    constructor(log) {
        this.log = log;
    }
    verify(scenario) {
        const errors = [];
        const entries = this.log.getEntries();
        let cursor = 0;
        let firstTimestamp = null;
        let lastTimestamp = null;
        for (let i = 0; i < scenario.expectations.length; i++) {
            const expectation = scenario.expectations[i];
            const matchIndex = this.findNextMatch(entries, cursor, expectation);
            if (matchIndex === -1) {
                if (!expectation.optional) {
                    errors.push({
                        message: `Expected entry of kind "${expectation.kind}" not found`,
                        expected: expectation,
                        index: i
                    });
                }
                continue;
            }
            const entry = entries[matchIndex];
            if (!firstTimestamp)
                firstTimestamp = entry.timestamp;
            lastTimestamp = entry.timestamp;
            if (expectation.payload !== undefined &&
                !this.payloadMatches(entry.payload, expectation.payload)) {
                errors.push({
                    message: `Payload mismatch for kind "${expectation.kind}"`,
                    expected: expectation.payload,
                    actual: entry.payload,
                    index: i
                });
            }
            cursor = matchIndex + 1;
        }
        const durationMs = (firstTimestamp && lastTimestamp)
            ? new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()
            : 0;
        return {
            scenario,
            passed: errors.length === 0,
            durationMs,
            errors
        };
    }
    /**
     * Partial match: every key present in `expected` must match in `actual`.
     * Extra keys in `actual` are ignored. This allows expectations like
     * { type: "voice.recognized" } to match a richer actual payload.
     */
    payloadMatches(actual, expected) {
        if (typeof expected !== "object" || expected === null) {
            return actual === expected;
        }
        if (typeof actual !== "object" || actual === null) {
            return false;
        }
        const expectedObj = expected;
        const actualObj = actual;
        return Object.keys(expectedObj).every(key => JSON.stringify(actualObj[key]) === JSON.stringify(expectedObj[key]));
    }
    findNextMatch(entries, fromIndex, expectation) {
        for (let i = fromIndex; i < entries.length; i++) {
            if (entries[i].kind === expectation.kind) {
                return i;
            }
        }
        return -1;
    }
}
//# sourceMappingURL=ScenarioVerifier.js.map