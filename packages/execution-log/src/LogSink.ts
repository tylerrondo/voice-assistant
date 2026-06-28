/**
 * Execution Log
 *
 * Contract for any output destination of the log.
 */

import type { LogEntry } from "./LogEntry"

export interface LogSink {

    write(entry: LogEntry): void

}