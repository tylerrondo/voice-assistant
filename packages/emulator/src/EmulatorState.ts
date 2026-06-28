/**
 * Voice Emulator
 *
 * Minimal internal state, used only to verify the infrastructure
 * (not real domain logic).
 */
export enum EmulatorState {
    Idle = "idle",
    Processing = "processing",
    Responding = "responding"
}