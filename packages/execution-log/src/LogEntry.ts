/**
 * Execution Log
 *
 * Describes one entry in the execution log.
 *
 * Knows nothing about Voice, Taxi, Browser or Emulator.
 */

export interface LogEntry {

    readonly timestamp: string

    readonly kind: string

    readonly payload: unknown

}