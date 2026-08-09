/**
 * Voice Contracts — Browser Implementation
 *
 * Implements SpeechProvider using Browser Speech Synthesis API.
 *
 * PR-9d.2 fix (per client feedback): previously speak() resolved the
 * instant window.speechSynthesis.speak(utterance) was CALLED, which
 * only means "we asked the browser to speak" — not that speech
 * actually started or finished playing. The Execution Log's "Speak"
 * entry therefore looked identical whether the browser genuinely
 * spoke the text or silently failed. This provider now tracks the
 * utterance's real onstart/onend/onerror events and exposes them via
 * optional callbacks, and speak() only resolves once the utterance
 * has actually finished (or errored).
 *
 * Does NOT know about:
 *  - events
 *  - FSM
 *  - templates
 *  - business logic
 */
import type { SpeechProvider } from "../provider/SpeechProvider";
import type { SpeechOptions } from "../types/SpeechOptions";
export declare class BrowserSpeechProvider implements SpeechProvider {
    private defaultLanguage;
    onStarted: ((text: string) => void) | null;
    onFinished: ((text: string) => void) | null;
    onError: ((text: string, message: string) => void) | null;
    setLanguage(language: string): void;
    speak(options: SpeechOptions): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=BrowserSpeechProvider.d.ts.map