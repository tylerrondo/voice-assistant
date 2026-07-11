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
import type { RecognitionProvider, Unsubscribe } from "../provider/RecognitionProvider";
import type { RecognitionResult } from "../types/RecognitionResult";
export declare class BrowserRecognitionProvider implements RecognitionProvider {
    private readonly recognition;
    private readonly listeners;
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
    private isActive;
    private pendingEndResolvers;
    constructor(language?: string);
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribe(listener: (result: RecognitionResult) => void): Unsubscribe;
    setLanguage(language: string): void;
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
    isSupported: boolean;
    private createRecognition;
    private configureRecognition;
    private bindEvents;
    private handleResult;
}
//# sourceMappingURL=BrowserRecognitionProvider.d.ts.map