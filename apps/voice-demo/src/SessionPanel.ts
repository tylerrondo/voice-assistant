/**
 * Validation Bench
 *
 * Test Session configuration panel.
 */
export interface SessionMeta {
    tester: string
    language: string
    recognitionProvider: string
    speechProvider: string
    scenarioSet: string
    build: string
    commit: string
    environment: string
    backendUrl: string
    login: string
    password: string
}

interface FieldDef {
    id: string
    label: string
    value: string
    type?: string
}

const FIELDS: FieldDef[] = [
    { id: "s-tester", label: "Tester", value: "Tester-1" },
    { id: "s-language", label: "Language", value: "en-US" },
    { id: "s-recognition", label: "Recognition Provider", value: "Browser" },
    { id: "s-speech", label: "Speech Provider", value: "Browser" },
    { id: "s-scenario-set", label: "Scenario Set", value: "builtin" },
    { id: "s-build", label: "Build", value: "1.0.0" },
    { id: "s-commit", label: "Commit", value: "bafc789" },
    { id: "s-env", label: "Environment", value: "demo" },
    { id: "s-backend-url", label: "Backend URL", value: "https://voice-assistant-two-olive.vercel.app" },
    { id: "s-login", label: "Login", value: "testvoiceee@gmail.com" },
    { id: "s-password", label: "Password", value: "tyler8787", type: "password" },
]

export function renderSessionPanel(root: HTMLElement): () => SessionMeta {
    root.innerHTML = `
        <style>
            .session-panel .session-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 0.75rem 1.25rem;
                margin-bottom: 0.5rem;
            }
            .session-panel .field {
                display: flex;
                flex-direction: column;
                min-width: 0;
            }
            .session-panel .field label {
                font-weight: bold;
                font-size: 0.85rem;
                margin-bottom: 0.25rem;
                color: #333;
            }
            .session-panel .field input {
                padding: 0.45rem 0.5rem;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 0.95rem;
                width: 100%;
                box-sizing: border-box;
            }
        </style>
        <div class="session-panel">
            <h2>Test Session</h2>
            <div class="session-grid">
                ${FIELDS.map(f => `
                    <div class="field">
                        <label for="${f.id}">${f.label}</label>
                        <input id="${f.id}" type="${f.type ?? "text"}" value="${f.value}" />
                    </div>
                `).join("")}
            </div>
        </div>
    `
    return (): SessionMeta => ({
        tester: (root.querySelector<HTMLInputElement>("#s-tester")!).value,
        language: (root.querySelector<HTMLInputElement>("#s-language")!).value,
        recognitionProvider: (root.querySelector<HTMLInputElement>("#s-recognition")!).value,
        speechProvider: (root.querySelector<HTMLInputElement>("#s-speech")!).value,
        scenarioSet: (root.querySelector<HTMLInputElement>("#s-scenario-set")!).value,
        build: (root.querySelector<HTMLInputElement>("#s-build")!).value,
        commit: (root.querySelector<HTMLInputElement>("#s-commit")!).value,
        environment: (root.querySelector<HTMLInputElement>("#s-env")!).value,
        backendUrl: (root.querySelector<HTMLInputElement>("#s-backend-url")!).value,
        login: (root.querySelector<HTMLInputElement>("#s-login")!).value,
        password: (root.querySelector<HTMLInputElement>("#s-password")!).value,
    })
}