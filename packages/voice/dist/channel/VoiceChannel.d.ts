/**
 * Voice Channel
 *
 * Connects voice providers (RecognitionProvider, SpeechProvider)
 * with the universal interaction-contract.
 *
 * Pure transport: this class contains NO domain logic, NO intent
 * resolution and NO template rendering of its own. Conversion is
 * delegated to RecognitionMapper / SpeechMapper, which can be
 * replaced later by a future semantic/intent resolver without
 * changing this class.
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
import type { InteractionAction, InteractionEvent } from "../../../interaction-contract/dist/index";
import type { VoiceChannelOptions } from "./VoiceChannelOptions";
import { VoiceChannelState } from "./VoiceChannelState";
export declare class VoiceChannel {
    private readonly options;
    private state;
    private unsubscribeRecognition;
    private unsubscribeInteraction;
    onAction: ((action: InteractionAction) => void) | null;
    onEvent: ((event: InteractionEvent) => void) | null;
    onSpeak: ((text: string) => void) | null;
    constructor(options: VoiceChannelOptions);
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
    ensureInteractionSubscribed(): void;
    start(): Promise<void>;
    stop(): Promise<void>;
    getState(): VoiceChannelState;
    /**
     * Manually injects an InteractionAction directly into the
     * InteractionContract, bypassing RecognitionProvider.
     *
     * Used by Validation Bench for manual / scripted testing when
     * no real microphone input is available (e.g. headless browser,
     * automated CI run, or "Inject text" testing mode).
     */
    injectAction(action: InteractionAction): Promise<void>;
    private handleRecognitionResult;
    private handleInteractionEvent;
}
//# sourceMappingURL=VoiceChannel.d.ts.map