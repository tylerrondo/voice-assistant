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
import { SUPPORTED_SCENARIO_SET_VERSIONS } from "./ScenarioSet";
export class ScenarioSetValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ScenarioSetValidationError";
    }
}
function fail(message) {
    throw new ScenarioSetValidationError(message);
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateStep(step, scenarioName, index) {
    if (!isPlainObject(step)) {
        fail(`Scenario "${scenarioName}": step ${index} must be an object`);
    }
    const kind = step.kind;
    if (kind !== "emit" && kind !== "delay" && kind !== "end") {
        fail(`Scenario "${scenarioName}": step ${index} has an invalid "kind" (${String(kind)})`);
    }
    if (kind === "emit") {
        const event = step.event;
        if (!isPlainObject(event) || typeof event.type !== "string" || event.type.length === 0) {
            fail(`Scenario "${scenarioName}": step ${index} ("emit") is missing event.type`);
        }
    }
    if (kind === "delay") {
        const ms = step.ms;
        if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
            fail(`Scenario "${scenarioName}": step ${index} ("delay") has an invalid "ms"`);
        }
    }
    return step;
}
function validateScenarioEntry(entry, index) {
    if (!isPlainObject(entry)) {
        fail(`scenarios[${index}] must be an object`);
    }
    const name = entry.name;
    if (typeof name !== "string" || name.length === 0) {
        fail(`scenarios[${index}] is missing a non-empty "name"`);
    }
    const activation = entry.activation;
    const trigger = entry.trigger;
    const hasActivation = isPlainObject(activation) &&
        typeof activation.type === "string" && activation.type.length > 0 &&
        typeof activation.value === "string" && activation.value.length > 0;
    const hasTrigger = typeof trigger === "string" && trigger.length > 0;
    if (!hasActivation && !hasTrigger) {
        fail(`Scenario "${name}" must have either "activation" (v2) or "trigger" (v1)`);
    }
    const steps = entry.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
        fail(`Scenario "${name}" must have a non-empty "steps" array`);
    }
    const validatedSteps = steps.map((step, stepIndex) => validateStep(step, name, stepIndex));
    return {
        ...entry,
        name,
        steps: validatedSteps
    };
}
export function validateScenarioSet(raw) {
    if (!isPlainObject(raw)) {
        fail("Scenario file must contain a JSON object");
    }
    const version = raw.version;
    if (typeof version !== "number" || !SUPPORTED_SCENARIO_SET_VERSIONS.includes(version)) {
        fail(`Unsupported "version" (${JSON.stringify(version)}). ` +
            `Supported versions: ${SUPPORTED_SCENARIO_SET_VERSIONS.join(", ")}`);
    }
    const id = raw.id;
    if (typeof id !== "string" || id.length === 0) {
        fail('Scenario file is missing a non-empty "id"');
    }
    const name = raw.name;
    if (typeof name !== "string" || name.length === 0) {
        fail('Scenario file is missing a non-empty "name"');
    }
    const scenarios = raw.scenarios;
    if (!Array.isArray(scenarios) || scenarios.length === 0) {
        fail('Scenario file must have a non-empty "scenarios" array');
    }
    const validatedScenarios = scenarios.map((entry, index) => validateScenarioEntry(entry, index));
    return {
        version,
        id,
        name,
        description: typeof raw.description === "string" ? raw.description : undefined,
        language: typeof raw.language === "string" ? raw.language : undefined,
        author: typeof raw.author === "string" ? raw.author : undefined,
        tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string") : undefined,
        scenarios: validatedScenarios
    };
}
//# sourceMappingURL=ScenarioSetValidator.js.map