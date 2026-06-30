/**
 * Voice Channel
 *
 * Connects voice providers (RecognitionProvider, SpeechProvider)
 * with the universal interaction-contract.
 *
 * Pure transport: this class contains NO domain logic, NO intent
 * resolution and NO template rendering of its own. Conversion is
 * delegated to RecognitionMapper / SpeechMapper, which can be
 * replaced later (PR-7, PR-8) without changing this class.
 *
 * Optional observability hooks (onAction/onEvent/onSpeak) were added
 * for Validation Bench (PR-9c) to allow external observers (e.g. the
 * Execution Log) to see traffic without changing transport behaviour.
 *
 * Does NOT know about:
 *  - Taxi
 *  - Driver
 *  - FSM
 *  - React
 */
import type { InteractionAction, InteractionEvent } from "../../../interaction-contract/dist/index"
import type { RecognitionResult } from "../types/RecognitionResult"
import type { VoiceChannelOptions } from "./VoiceChannelOptions"
import { VoiceChannelState } from "./VoiceChannelState"

export class VoiceChannel {

    private readonly options: VoiceChannelOptions
    private state: VoiceChannelState = VoiceChannelState.Idle
    private unsubscribeRecognition: (() => void) | null = null
    private unsubscribeInteraction: (() => void) | null = null

    public onAction: ((action: InteractionAction) => void) | null = null
    public onEvent: ((event: InteractionEvent) => void) | null = null
    public onSpeak: ((text: string) => void) | null = null

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
     * Manually injects an InteractionAction directly into the
     * InteractionContract, bypassing RecognitionProvider.
     *
     * Used by Validation Bench for manual / scripted testing when
     * no real microphone input is available (e.g. headless browser,
     * automated CI run, or "Inject text" testing mode).
     */
    async injectAction(action: InteractionAction): Promise<void> {
        this.onAction?.(action)
        try {
            await this.options.interaction.dispatch(action)
        } catch (error) {
            void error
        }
    }

    private handleRecognitionResult(result: RecognitionResult): void {
        const action = this.options.recognitionMapper.map(result)
        this.onAction?.(action)
        this.options.interaction
            .dispatch(action)
            .catch((error: unknown) => {
                // Per review: dispatch() failures are intentionally
                // swallowed at this layer for now. The channel does
                // not implement retries or error surfacing -- this is
                // a deliberate, documented limitation of PR-6.
                void error
            })
    }

    private handleInteractionEvent(event: InteractionEvent): void {
        this.onEvent?.(event)
        const speechOptions = this.options.speechMapper.map(event)
        this.onSpeak?.(speechOptions.text)
        void this.options.speech.speak(speechOptions)
    }

}