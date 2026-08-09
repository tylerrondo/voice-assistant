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
    /**
     * PR-9d.2 fix: subscribes to InteractionContract events WITHOUT
     * starting the microphone/recognition provider. This is idempotent
     * (safe to call multiple times / already subscribed).
     *
     * Previously, Event/Speak observability only worked when start()
     * had been called (which also starts the microphone). Flows that
     * dispatch actions directly via injectAction() — Automatic "Run
     * All", the manual "Inject action" button, and Interactive Runner
     * in Inject Action input-source mode — never called start(), so
     * their emitted Events/Speak were never observed: the Execution
     * Log only ever showed the initial Action, with no corresponding
     * Event or Speak entries. Calling this once up front (regardless
     * of mode) fixes that without requesting microphone access.
     */
    ensureInteractionSubscribed() {
        if (this.unsubscribeInteraction) {
            return;
        }
        this.unsubscribeInteraction =
            this.options.interaction.subscribe((event) => this.handleInteractionEvent(event));
    }
    async start() {
        if (this.state === VoiceChannelState.Running) {
            return;
        }
        this.unsubscribeRecognition =
            this.options.recognition.subscribe((result) => this.handleRecognitionResult(result));
        this.ensureInteractionSubscribed();
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
        // PR-9e.2 fix: keep the interaction subscription alive after stop().
        // Automatic Run All and Inject Action flows never call start(), they rely
        // on ensureInteractionSubscribed() instead. Tearing down this listener
        // when Interactive mic mode stops the channel left later Automatic runs
        // without Event/Speak handling and without audible TTS.
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