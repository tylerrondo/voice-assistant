/**
 * Verification Harness
 *
 * Describes one expected entry in the execution log.
 * Uses "kind: string" to stay decoupled from ExecutionLog's type list.
 */
export interface VerificationExpectation {
    kind: string;
    payload?: unknown;
    optional?: boolean;
}
//# sourceMappingURL=VerificationExpectation.d.ts.map