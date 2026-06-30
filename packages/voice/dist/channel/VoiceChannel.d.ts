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