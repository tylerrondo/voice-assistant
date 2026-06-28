/**
 * Execution Log
 *
 * Stores log entries in memory. Used by Verification Harness and
 * automated tests (PR-9b) to inspect what happened during a run.
 */

import type { LogEntry } from "./LogEntry"
import type { LogSink } from "./LogSink"

export class MemoryLogSink implements LogSink {

    private readonly entries: LogEntry[] = []

    write(entry: LogEntry): void {
        this.entries.push(entry)
    }

    getEntries(): ReadonlyArray<LogEntry> {
        return this.entries
    }

    clear(): void {
        this.entries.length = 0
    }

}