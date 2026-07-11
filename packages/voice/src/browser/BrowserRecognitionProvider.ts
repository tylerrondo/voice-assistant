/**
 * Voice Contracts — Browser Implementation
 *
 * Implements RecognitionProvider using Browser Web Speech API.
 *
 * Does NOT know about:
 *  - Taxi
 *  - Driver
 *  - FSM
 *  - Interaction Contract
 *  - commands
 *  - events
 */
import type {
    RecognitionProvider,
    Unsubscribe
} from "../provider/RecognitionProvider"
import type { RecognitionResult } from "../types/RecognitionResult"
import type {
    SpeechRecognition,
    SpeechRecognitionConstructor,
    SpeechRecognitionEvent
} from "./browser-types"

export class BrowserRecognitionProvider implements RecognitionProvider {
    private readonly recognition: SpeechRecognition
    private readonly listeners =
        new Set<(result: RecognitionResult) => void>()

    /**
     * PR-9d.2 fix: the Web Speech API's stop() is asynchronous under
     * the hood — the real "end" of the session only happens when the
     * 'onend' event fires, some time after recognition.stop() is
     * called. The previous implementation resolved stop() immediately
     * without waiting for that, so callers doing
     * `await stop(); await start()` back-to-back (as the Interactive
     * Runner does between steps) could start a new session before the
     * browser had actually finished the previous one. That race
     * occasionally caused the engine to deliver the same result twice
     * (observed as a duplicated Action/Event/Speak triple for a single
     * spoken step). stop() now properly waits for the real 'onend'
     * event before resolving, so start() is never called while a
     * previous session is still winding down.
     */
    private isActive = false
    private pendingEndResolvers: Array<() => void> = []

    constructor(language = "ru-RU") {
        this.recognition = this.createRecognition()
        this.configureRecognition(language)
        this.bindEvents()
    }

    async start(): Promise<void> {
        // Only track as "active" (awaiting a real onend) when actually
        // supported — otherwise stop() would wait forever for an
        // 'onend' event that the no-op stub will never fire.
        this.isActive = this.isSupported
        this.recognition.start()
    }

    async stop(): Promise<void> {
        if (!this.isActive) {
            return
        }
        await new Promise<void>((resolve) => {
            this.pendingEndResolvers.push(resolve)
            this.recognition.stop()
        })
    }

    subscribe(
        listener: (result: RecognitionResult) => void
    ): Unsubscribe {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    setLanguage(language: string): void {
        this.recognition.lang = language
    }

    /**
     * PR-10 fix: WebKit/Safari (and Playwright's WebKit project) do
     * not implement the SpeechRecognition API at all. The constructor
     * previously threw immediately in that case, which crashed the
     * ENTIRE app on load (not just the mic feature) — since
     * Bootstrap.ts constructs this provider eagerly, before the user
     * ever touches mic-related UI. This now falls back to a no-op
     * stub instead of throwing, so the rest of Validation Bench (all
     * Automatic / Inject Action functionality) still works fine on
     * browsers without speech recognition support. Real microphone
     * input simply won't produce results there, which is an inherent
     * platform limitation, not a bug.
     */
    isSupported = true

    private createRecognition(): SpeechRecognition {
        const Ctor: SpeechRecognitionConstructor | undefined =
            window.SpeechRecognition ??
            window.webkitSpeechRecognition
        if (!Ctor) {
            console.warn(
                "SpeechRecognition API is not supported in this browser. " +
                "Real microphone input will be unavailable; Automatic/Inject Action modes are unaffected."
            )
            this.isSupported = false
            return {
                lang: "",
                interimResults: false,
                maxAlternatives: 1,
                continuous: false,
                start: () => {},
                stop: () => {},
                onresult: null,
                onerror: null,
                onend: null
            } as unknown as SpeechRecognition
        }
        return new Ctor()
    }

    private configureRecognition(language: string): void {
        this.recognition.lang = language
        this.recognition.interimResults = false
        this.recognition.maxAlternatives = 1
        this.recognition.continuous = false
    }

    private bindEvents(): void {
        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            this.handleResult(event)
        }
        this.recognition.onerror = () => {
            // Intentionally left empty: this provider does not decide
            // how errors should be surfaced to the application. A
            // dedicated error channel can be added to the contract later.
            // Note: onerror is typically followed by onend, which will
            // still resolve any pending stop() waiters below.
        }
        // PR-9d.2 fix: track the real end of a recognition session so
        // stop() can wait for it instead of resolving instantly.
        ;(this.recognition as unknown as { onend: (() => void) | null }).onend = () => {
            this.isActive = false
            const resolvers = this.pendingEndResolvers
            this.pendingEndResolvers = []
            resolvers.forEach((resolve) => resolve())
        }
    }

    private handleResult(event: SpeechRecognitionEvent): void {
        const resultItem = event.results.item(event.resultIndex)
        if (!resultItem || resultItem.length === 0) {
            return
        }
        const alternative = resultItem.item(0)
        if (!alternative) {
            return
        }
        const result: RecognitionResult = {
            text: alternative.transcript,
            confidence: alternative.confidence,
            language: this.recognition.lang
        }
        for (const listener of this.listeners) {
            listener(result)
        }
    }
}