/**
 * Execution Log
 *
 * Central store for the sequence of execution entries.
 *
 * Responsibilities:
 *  - append entries
 *  - read entries
 *  - clear the log
 *
 * Does NOT know how entries are displayed or exported -- that is
 * the responsibility of LogSink implementations, optionally
 * reached through a LogDispatcher passed in at construction time.
 */

import type { LogEntry } from "./LogEntry"
import type { LogSink } from "./LogSink"

export class ExecutionLog {

    private readonly entries: LogEntry[] = []

    constructor(private readonly sink?: LogSink) {}

    append(kind: string, payload: unknown): void {

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            kind,
            payload
        }

        this.entries.push(entry)

        this.sink?.write(entry)

    }

    getEntries(): ReadonlyArray<LogEntry> {
        return this.entries
    }

    clear(): void {
        this.entries.length = 0
    }

}