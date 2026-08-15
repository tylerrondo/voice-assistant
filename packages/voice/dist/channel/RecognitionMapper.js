/**
 * Voice Channel
 *
 * Converts a RecognitionResult into an InteractionAction.
 *
 * This is a temporary, minimal default implementation.
 * A future semantic/intent resolver may replace this mapper
 * without changing VoiceChannel.
 */
export class DefaultRecognitionMapper {
    map(result) {
        return {
            type: "voice.recognized",
            payload: {
                text: result.text,
                confidence: result.confidence,
                language: result.language
            }
        };
    }
}
//# sourceMappingURL=RecognitionMapper.js.map