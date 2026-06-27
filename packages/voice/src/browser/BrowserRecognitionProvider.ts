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

import {
    getSpeechRecognitionConstructor,
    type SpeechRecognition,
    type SpeechRecognitionEvent,
    type SpeechRecognitionErrorEvent
} from "./browser-types"

export class BrowserRecognitionProvider implements RecognitionProvider {

    private readonly recognition: SpeechRecognition

    private readonly listeners =
        new Set<(result: RecognitionResult) => void>()

    constructor(language = "ru-RU") {

        const Ctor = getSpeechRecognitionConstructor()

        this.recognition = new Ctor()

        this.recognition.lang = language
        this.recognition.interimResults = false
        this.recognition.maxAlternatives = 1
        this.recognition.continuous = false

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {

            const alternative = event.results.item(event.resultIndex).item(0)

            const result: RecognitionResult = {
                text: alternative.transcript,
                confidence: alternative.confidence,
                language
            }

            for (const listener of this.listeners) {
                listener(result)
            }

        }

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            // Per contract, errors are not part of the minimal model yet.
            // Logged here only for local debugging during PR-5.
            console.error("BrowserRecognitionProvider error:", event.error, event.message)
        }

    }

    async start(): Promise<void> {
        this.recognition.start()
    }

    async stop(): Promise<void> {
        this.recognition.stop()
    }

    subscribe(
        listener: (result: RecognitionResult) => void
    ): Unsubscribe {

        this.listeners.add(listener)

        return () => {
            this.listeners.delete(listener)
        }

    }

}