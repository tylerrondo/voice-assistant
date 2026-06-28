/**
 * Validation Bench
 *
 * Wires together all components for the Validation Bench.
 */

import {
    BrowserRecognitionProvider,
    BrowserSpeechProvider
} from "../../../packages/voice/dist/browser/index"

import {
    VoiceChannel,
    DefaultRecognitionMapper,
    DefaultSpeechMapper
} from "../../../packages/voice/dist/channel/index"

import { EmulatorContract } from "../../../packages/emulator/dist/index"
import { ScenarioRegistry, registerBuiltinScenarios } from "../../../packages/scenario-engine/dist/index"
import { ExecutionLog, LogDispatcher, ConsoleLogSink, MemoryLogSink } from "../../../packages/execution-log/dist/index"
import { DemoLogger } from "./DemoLogger"
import { BackendClient } from "./BackendClient"

export interface BenchApp {
    readonly channel: VoiceChannel
    readonly logger: DemoLogger
    readonly executionLog: ExecutionLog
    readonly memorySink: MemoryLogSink
    readonly registry: ScenarioRegistry
    readonly backend: BackendClient
}

export function bootstrap(language = "ru-RU"): BenchApp {

    const registry = new ScenarioRegistry()
    registerBuiltinScenarios(registry)

    const dispatcher = new LogDispatcher()
    const consoleSink = new ConsoleLogSink()
    const memorySink = new MemoryLogSink()
    dispatcher.register(consoleSink)
    dispatcher.register(memorySink)

    const executionLog = new ExecutionLog(dispatcher)
    const logger = new DemoLogger(executionLog)

    const interaction = new EmulatorContract(registry)
    const recognition = new BrowserRecognitionProvider(language)
    const speech = new BrowserSpeechProvider()

    const channel = new VoiceChannel({
        recognition,
        speech,
        interaction,
        recognitionMapper: new DefaultRecognitionMapper(),
        speechMapper: new DefaultSpeechMapper()
    })

    const backend = new BackendClient()

    return { channel, logger, executionLog, memorySink, registry, backend }

}