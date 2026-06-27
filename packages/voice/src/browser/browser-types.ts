/**
 * Voice Contracts — Browser Implementation
 *
 * Type declarations for Browser Web Speech API.
 * Contains no logic.
 */

export interface SpeechRecognitionAlternative {
    readonly transcript: string
    readonly confidence: number
}

export interface SpeechRecognitionResultItem {
    readonly length: number
    item(index: number): SpeechRecognitionAlternative
    [index: number]: SpeechRecognitionAlternative
}

export interface SpeechRecognitionResultList {
    readonly length: number
    item(index: number): SpeechRecognitionResultItem
    [index: number]: SpeechRecognitionResultItem
}

export interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number
    readonly results: SpeechRecognitionResultList
}

export interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string
    readonly message: string
}

export interface SpeechRecognition extends EventTarget {
    lang: string
    interimResults: boolean
    maxAlternatives: number
    continuous: boolean

    start(): void
    stop(): void
    abort(): void

    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: ((event: Event) => void) | null
}

export interface SpeechRecognitionConstructor {
    new (): SpeechRecognition
}

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructor
        webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor {
    const ctor =
        window.SpeechRecognition ??
        window.webkitSpeechRecognition

    if (!ctor) {
        throw new Error(
            "SpeechRecognition API is not supported in this browser."
        )
    }

    return ctor
}