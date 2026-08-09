/**
 * Scenario Engine — PR-11
 *
 * Types for the external JSON scenario file format
 * ("Platform Scenario Specification v2.0").
 *
 * A ScenarioSet is plain data describing a domain interaction.
 * It knows nothing about who runs it, why, or how results are
 * judged (Validation Bench, Driver Training, Driver Certification,
 * Voice Analytics, ...). Only `activation`/`trigger` and `steps`
 * are used by the Scenario Engine / Validation Bench today; every
 * other field is metadata reserved for future consumers and is
 * ignored by this package (see docs/rfc/PR-11.md).
 */
/** JSON contract versions this package knows how to read. */
export const SUPPORTED_SCENARIO_SET_VERSIONS = [1, 2];
//# sourceMappingURL=ScenarioSet.js.map