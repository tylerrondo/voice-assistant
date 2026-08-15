/**
 * Voice Channel
 *
 * Converts a RecognitionResult into an InteractionAction.
 *
 * This is a temporary, minimal default implementation.
 * A future semantic/intent resolver may replace this mapper
 * without changing VoiceChannel.
 */

import type { InteractionAction } from "../../../interaction-contract/dist/index"
import type { RecognitionResult } from "../types/RecognitionResult"

export interface RecognitionMapper {

    map(result: RecognitionResult): InteractionAction

}

export class DefaultRecognitionMapper implements RecognitionMapper {

    map(result: RecognitionResult): InteractionAction {

        return {
            type: "voice.recognized",
            payload: {
                text: result.text,
                confidence: result.confidence,
                language: result.language
            }
        }

    }

}