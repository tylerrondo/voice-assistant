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
import type { SpeechProvider } from "../provider/SpeechProvider"
import type { SpeechOptions } from "../types/SpeechOptions"

export class BrowserSpeechProvider implements SpeechProvider {

    private defaultLanguage: string | undefined

    public onStarted: ((text: string) => void) | null = null
    public onFinished: ((text: string) => void) | null = null
    public onError: ((text: string, message: string) => void) | null = null

    setLanguage(language: string): void {
        this.defaultLanguage = language
    }

    async speak(options: SpeechOptions): Promise<void> {
        const synthesis = window.speechSynthesis
        // Chrome may leave speechSynthesis paused after cancel(); resume so the
        // next session in a different Validation mode can still be heard.
        if (synthesis.paused) {
            synthesis.resume()
        }

        const utterance = new SpeechSynthesisUtterance(options.text)
        const language = options.language ?? this.defaultLanguage
        if (language) {
            utterance.lang = language
        }

        await new Promise<void>((resolve) => {
            utterance.onstart = () => {
                this.onStarted?.(options.text)
            }
            utterance.onend = () => {
                this.onFinished?.(options.text)
                resolve()
            }
            utterance.onerror = (event) => {
                const message =
                    (event as unknown as { error?: string })?.error ?? "unknown speech synthesis error"
                this.onError?.(options.text, message)
                resolve()
            }
            synthesis.speak(utterance)
        })
    }

    async stop(): Promise<void> {
        const synthesis = window.speechSynthesis
        synthesis.cancel()
        if (synthesis.paused) {
            synthesis.resume()
        }
    }
}