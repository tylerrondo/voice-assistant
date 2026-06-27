/**
 * Voice Channel
 *
 * Configuration options for VoiceChannel.
 */

import type { RecognitionProvider } from "../provider/RecognitionProvider"
import type { SpeechProvider } from "../provider/SpeechProvider"
import type { InteractionContract } from "../../../interaction-contract/dist/index"

export interface VoiceChannelOptions {

    readonly recognition: RecognitionProvider

    readonly speech: SpeechProvider

    readonly interaction: InteractionContract

}