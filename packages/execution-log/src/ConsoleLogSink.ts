/**
 * Execution Log
 *
 * Outputs log entries to console. One of several possible LogSink
 * implementations.
 */

import type { LogEntry } from "./LogEntry"
import type { LogSink } from "./LogSink"

export class ConsoleLogSink implements LogSink {

    write(entry: LogEntry): void {
        console.log(`[${entry.kind}]`, entry.payload)
    }

}