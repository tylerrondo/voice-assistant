/**
 * Voice Contracts — Browser Implementation
 *
 * Implements SpeechProvider using Browser Speech Synthesis API.
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

    async speak(options: SpeechOptions): Promise<void> {

        const utterance = new SpeechSynthesisUtterance(options.text)

        if (options.language) {
            utterance.lang = options.language
        }

        window.speechSynthesis.speak(utterance)

    }

    async stop(): Promise<void> {
        window.speechSynthesis.cancel()
    }

}