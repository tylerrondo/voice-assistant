/**
 * Scenario Engine — PR-11
 *
 * PR-11 moved the built-in scenarios out of source code and into
 * scenarios/builtin.json (loaded by BuiltinScenarioProvider). This
 * file no longer describes any scenario itself — it only keeps the
 * `registerBuiltinScenarios(registry)` convenience entry point that
 * existing callers (Bootstrap.ts, DemoRegistry.ts) already use, so
 * PR-11 did not require touching every call site.
 */
import { loadBuiltinScenarioSet } from "./BuiltinScenarioProvider";
import { loadScenarioSetIntoRegistry } from "./ScenarioSetLoader";
/**
 * Loads scenarios/builtin.json (validated) into the given registry.
 * Consumers that don't want the built-in examples can simply skip
 * calling this and register their own scenarios instead.
 */
export function registerBuiltinScenarios(registry) {
    const builtinSet = loadBuiltinScenarioSet();
    loadScenarioSetIntoRegistry(registry, builtinSet);
}
//# sourceMappingURL=BuiltinScenarios.js.map