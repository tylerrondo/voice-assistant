/**
 * Voice Channel
 *
 * Converts a RecognitionResult into an InteractionAction.
 *
 * This is a temporary, minimal default implementation.
 * A future semantic/intent resolver may replace this mapper
 * without changing VoiceChannel.
 */
import type { InteractionAction } from "../../../interaction-contract/dist/index";
import type { RecognitionResult } from "../types/RecognitionResult";
export interface RecognitionMapper {
    map(result: RecognitionResult): InteractionAction;
}
export declare class DefaultRecognitionMapper implements RecognitionMapper {
    map(result: RecognitionResult): InteractionAction;
}
//# sourceMappingURL=RecognitionMapper.d.ts.map