/**
 * Validation Bench
 *
 * Handles authentication and report sending via backend API.
 * No own SMTP. No own auth mechanism.
 * Uses only existing backend public API.
 */

export type ConnectionStatus = "connected" | "auth-failed" | "mail-unavailable"

export interface BackendSession {
    token: string
    u_hash: string
    status: ConnectionStatus
}

export class BackendClient {

    private session: BackendSession | null = null

    async connect(baseUrl: string, login: string, password: string): Promise<BackendSession> {

        try {
            const res = await fetch(`${baseUrl}/api/v1/auth/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password, type: "e-mail" })
            })

            if (!res.ok) {
                this.session = { token: "", u_hash: "", status: "auth-failed" }
                return this.session
            }

            const data = await res.json() as { token: string; u_hash: string }
            this.session = { token: data.token, u_hash: data.u_hash, status: "connected" }
            return this.session

        } catch {
            this.session = { token: "", u_hash: "", status: "auth-failed" }
            return this.session
        }

    }

    async sendReport(baseUrl: string, report: unknown, eId: string): Promise<boolean> {

        if (!this.session || this.session.status !== "connected") {
            return false
        }

        const json = JSON.stringify(report)
        const file = btoa(unescape(encodeURIComponent(json)))

        try {
            const res = await fetch(`${baseUrl}/api/v1/mail/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: this.session.token,
                    u_hash: this.session.u_hash,
                    subject: "Validation Report",
                    body: "See attached JSON report.",
                    file,
                    e_id: eId
                })
            })
            return res.ok
        } catch {
            this.session = { ...this.session, status: "mail-unavailable" }
            return false
        }

    }

}