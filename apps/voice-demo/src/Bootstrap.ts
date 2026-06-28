/**
 * Voice Demo
 *
 * Creates and wires together all components needed for the demo:
 * BrowserRecognitionProvider, BrowserSpeechProvider, ScenarioRegistry,
 * EmulatorContract, VoiceChannel.
 *
 * As of PR-9a, observability goes through ExecutionLog + LogDispatcher
 * instead of direct console.log calls. ConsoleLogSink is registered
 * by default; App.ts additionally registers a DOM sink on the same
 * dispatcher to render the log in the page.
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

import {
    ExecutionLog,
    LogDispatcher,
    ConsoleLogSink
} from "../../../packages/execution-log/dist/index"

import { createDemoRegistry } from "./DemoRegistry"
import { DemoLogger } from "./DemoLogger"

export interface DemoApp {

    readonly channel: VoiceChannel

    readonly log: ExecutionLog

    readonly dispatcher: LogDispatcher

}

export function bootstrap(language = "ru-RU"): DemoApp {

    const registry = createDemoRegistry()
    const interaction = new EmulatorContract(registry)

    const recognition = new BrowserRecognitionProvider(language)
    const speech = new BrowserSpeechProvider()

    const dispatcher = new LogDispatcher()
    dispatcher.register(new ConsoleLogSink())

    const log = new ExecutionLog(dispatcher)
    const logger = new DemoLogger(log)

    const recognitionMapper = new DefaultRecognitionMapper()
    const speechMapper = new DefaultSpeechMapper()

    // Logging is wired independently of VoiceChannel's own internal
    // subscriptions: both RecognitionProvider and InteractionContract
    // support multiple listeners, so observing here does not interfere
    // with VoiceChannel's transport responsibilities.
    recognition.subscribe((result) => {
        logger.logAction(recognitionMapper.map(result))
    })

    interaction.subscribe((event) => {
        logger.logEvent(event)
        logger.logSpeak(speechMapper.map(event).text)
    })

    const channel = new VoiceChannel({
        recognition,
        speech,
        interaction,
        recognitionMapper,
        speechMapper
    })

    return { channel, log, dispatcher }

}