/**
 * Validation Bench
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
            const authParams = new URLSearchParams()
            authParams.set("login", login)
            authParams.set("password", password)
            authParams.set("type", "e-mail")
            const authRes = await fetch(`${baseUrl}/api/v1/auth`, {
                method: "POST",
                body: authParams
            })
            if (!authRes.ok) {
                this.session = { token: "", u_hash: "", status: "auth-failed" }
                return this.session
            }
            const authData = await authRes.json() as { auth_hash?: string }
            if (!authData.auth_hash) {
                this.session = { token: "", u_hash: "", status: "auth-failed" }
                return this.session
            }
            const tokenParams = new URLSearchParams()
            tokenParams.set("auth_hash", authData.auth_hash)
            const tokenRes = await fetch(`${baseUrl}/api/v1/token`, {
                method: "POST",
                body: tokenParams
            })
            if (!tokenRes.ok) {
                this.session = { token: "", u_hash: "", status: "auth-failed" }
                return this.session
            }
            const tokenData = await tokenRes.json() as { data: { token: string; u_hash: string } }
            this.session = {
                token: tokenData.data.token,
                u_hash: tokenData.data.u_hash,
                status: "connected"
            }
            return this.session
        } catch {
            this.session = { token: "", u_hash: "", status: "auth-failed" }
            return this.session!
        }
    }

    async getEmailId(baseUrl: string): Promise<string | null> {
        try {
            const query = encodeURIComponent(JSON.stringify({ site_emails: true }))
            const res = await fetch(`${baseUrl}/api/v1/data/?json_like=${query}`)
            if (!res.ok) return null
            const data = await res.json() as { data?: { data?: { site_emails?: Record<string, unknown> } } }
            const siteEmails = data.data?.data?.site_emails
            if (!siteEmails) return null
            if (siteEmails["2"]) return "2"
            const keys = Object.keys(siteEmails)
            return keys.length > 0 ? keys[0] : null
        } catch {
            return null
        }
    }

    async sendReport(baseUrl: string, report: unknown, emailId: string): Promise<boolean> {
        if (!this.session || this.session.status !== "connected") {
            return false
        }

        const json = JSON.stringify(report)
        const blob = new Blob([json], { type: "application/json;charset=UTF-8" })
        const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
        })
        // dataUrl looks like "data:application/json;charset=UTF-8;base64,XXXX".
        // The backend expects only the raw base64 payload after the comma,
        // otherwise it stores/sends an empty (0 byte) attachment.
        const base64Payload = dataUrl.substring(dataUrl.indexOf(",") + 1)
        const file = JSON.stringify([
            {
                base64: base64Payload,
                name: "validation-report.json"
            }
        ])

        try {
            const params = new URLSearchParams()
            params.set("token", this.session.token)
            params.set("u_hash", this.session.u_hash)
            params.set("subject", "Validation Report")
            params.set("body", "See attached JSON report.")
            params.set("file", file)
            const res = await fetch(`${baseUrl}/api/v1/mail/${emailId}/send/`, {
                method: "POST",
                body: params
            })
            return res.ok
        } catch {
            this.session = { ...this.session, status: "mail-unavailable" }
            return false
        }
    }
}