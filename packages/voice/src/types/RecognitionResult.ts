/**
 * Voice Contracts
 *
 * Result of a speech recognition attempt.
 *
 * This is a minimal model, not a final one.
 * Future speech engines may add fields such as:
 *  - isFinal
 *  - alternatives
 *  - duration
 *  - timestamps
 */

export interface RecognitionResult {

    readonly text: string

    readonly confidence: number

    readonly language?: string

}