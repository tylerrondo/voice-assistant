import { VoiceChannelState } from "./VoiceChannelState";
export class VoiceChannel {
    options;
    state = VoiceChannelState.Idle;
    unsubscribeRecognition = null;
    unsubscribeInteraction = null;
    onAction = null;
    onEvent = null;
    onSpeak = null;
    constructor(options) {
        this.options = options;
    }
    async start() {
        if (this.state === VoiceChannelState.Running) {
            return;
        }
        this.unsubscribeRecognition =
            this.options.recognition.subscribe((result) => this.handleRecognitionResult(result));
        this.unsubscribeInteraction =
            this.options.interaction.subscribe((event) => this.handleInteractionEvent(event));
        await this.options.recognition.start();
        this.state = VoiceChannelState.Running;
    }
    async stop() {
        if (this.state !== VoiceChannelState.Running) {
            return;
        }
        await this.options.recognition.stop();
        await this.options.speech.stop();
        this.unsubscribeRecognition?.();
        this.unsubscribeRecognition = null;
        this.unsubscribeInteraction?.();
        this.unsubscribeInteraction = null;
        this.state = VoiceChannelState.Stopped;
    }
    getState() {
        return this.state;
    }
    /**
     * Manually injects an InteractionAction directly into the
     * InteractionContract, bypassing RecognitionProvider.
     *
     * Used by Validation Bench for manual / scripted testing when
     * no real microphone input is available (e.g. headless browser,
     * automated CI run, or "Inject text" testing mode).
     */
    async injectAction(action) {
        this.onAction?.(action);
        try {
            await this.options.interaction.dispatch(action);
        }
        catch (error) {
            void error;
        }
    }
    handleRecognitionResult(result) {
        const action = this.options.recognitionMapper.map(result);
        this.onAction?.(action);
        this.options.interaction
            .dispatch(action)
            .catch((error) => {
            // Per review: dispatch() failures are intentionally
            // swallowed at this layer for now. The channel does
            // not implement retries or error surfacing -- this is
            // a deliberate, documented limitation of PR-6.
            void error;
        });
    }
    handleInteractionEvent(event) {
        this.onEvent?.(event);
        const speechOptions = this.options.speechMapper.map(event);
        this.onSpeak?.(speechOptions.text);
        void this.options.speech.speak(speechOptions);
    }
}
//# sourceMappingURL=VoiceChannel.js.map