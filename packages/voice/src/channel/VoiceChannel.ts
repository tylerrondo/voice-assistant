/**
 * Voice Channel
 *
 * Connects voice providers (RecognitionProvider, SpeechProvider)
 * with the universal interaction-contract.
 *
 * Pure transport: this class contains NO domain logic, NO intent
 * resolution and NO template rendering. Text in/out is passed
 * through stub conversions only.
 *
 * Does NOT know about:
 *  - Taxi
 *  - Driver
 *  - FSM
 *  - React
 */

import type { InteractionEvent } from "../../../interaction-contract/dist/index"

import type { RecognitionResult } from "../types/RecognitionResult"
import type { VoiceChannelOptions } from "./VoiceChannelOptions"
import { VoiceChannelState } from "./VoiceChannelState"

export class VoiceChannel {

    private readonly options: VoiceChannelOptions

    private state: VoiceChannelState = VoiceChannelState.Idle

    private unsubscribeRecognition: (() => void) | null = null

    private unsubscribeInteraction: (() => void) | null = null

    constructor(options: VoiceChannelOptions) {
        this.options = options
    }

    async start(): Promise<void> {

        if (this.state === VoiceChannelState.Running) {
            return
        }

        this.unsubscribeRecognition =
            this.options.recognition.subscribe(
                (result) => this.handleRecognitionResult(result)
            )

        this.unsubscribeInteraction =
            this.options.interaction.subscribe(
                (event: InteractionEvent) => this.handleInteractionEvent(event)
            )

        await this.options.recognition.start()

        this.state = VoiceChannelState.Running

    }

    async stop(): Promise<void> {

        if (this.state !== VoiceChannelState.Running) {
            return
        }

        await this.options.recognition.stop()
        await this.options.speech.stop()

        this.unsubscribeRecognition?.()
        this.unsubscribeRecognition = null

        this.unsubscribeInteraction?.()
        this.unsubscribeInteraction = null

        this.state = VoiceChannelState.Stopped

    }

    getState(): VoiceChannelState {
        return this.state
    }

    /**
     * Recognized speech -> InteractionContract.
     *
     * This is a stub conversion. Real intent resolution
     * is the responsibility of a future IntentResolver (PR-7).
     */
    private handleRecognitionResult(result: RecognitionResult): void {

        void this.options.interaction.dispatch({
            type: "voice.recognized",
            payload: {
                text: result.text,
                confidence: result.confidence,
                language: result.language
            }
        })

    }

    /**
     * InteractionContract event -> spoken text.
     *
     * This is a stub conversion. Real response generation
     * is the responsibility of a future TemplateRenderer (PR-8).
     */
    private handleInteractionEvent(event: InteractionEvent): void {

        void this.options.speech.speak({
            text: event.type
        })

    }

}