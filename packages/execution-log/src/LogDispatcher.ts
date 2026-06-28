/**
 * Execution Log
 *
 * Receives entries from ExecutionLog and forwards them to every
 * registered LogSink. A single log can simultaneously be sent to
 * Console, memory, a file, HTML, or future analysis tools.
 *
 * Implements LogSink itself, so an ExecutionLog can write to a
 * LogDispatcher exactly as it would to any single sink.
 */

import type { LogEntry } from "./LogEntry"
import type { LogSink } from "./LogSink"

export class LogDispatcher implements LogSink {

    private readonly sinks = new Set<LogSink>()

    register(sink: LogSink): () => void {

        this.sinks.add(sink)

        return () => {
            this.sinks.delete(sink)
        }

    }

    write(entry: LogEntry): void {

        for (const sink of this.sinks) {
            sink.write(entry)
        }

    }

}