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

import type { ScenarioStep } from "./ScenarioStep"

/** JSON contract versions this package knows how to read. */
export const SUPPORTED_SCENARIO_SET_VERSIONS: ReadonlyArray<number> = [1, 2]

/**
 * v2.0 generalizes "trigger: string" into a typed activation block,
 * so future channels (button, FSM, timer, geo, ...) can share the
 * same file format. v1 files (plain `trigger`) are still accepted.
 */
export interface ScenarioActivation {
    readonly type: string
    readonly value: string
}

export interface ScenarioSetEntry {
    readonly id?: string
    readonly name: string
    readonly description?: string
    readonly category?: string
    readonly difficulty?: string

    /** v1 field. Prefer `activation` in new files. */
    readonly trigger?: string

    /** v2 field. Takes precedence over `trigger` if both are present. */
    readonly activation?: ScenarioActivation

    readonly expectedPhrase?: string
    readonly aliases?: ReadonlyArray<string>

    readonly steps: ReadonlyArray<ScenarioStep>
}

export interface ScenarioSet {
    readonly version: number
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly language?: string
    readonly author?: string
    readonly tags?: ReadonlyArray<string>
    readonly scenarios: ReadonlyArray<ScenarioSetEntry>
}
