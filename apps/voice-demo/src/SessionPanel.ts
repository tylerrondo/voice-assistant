/**
 * Validation Bench
 *
 * Test Session configuration panel with controlled dropdowns.
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

export function renderSessionPanel(root: HTMLElement): () => SessionMeta {

    root.innerHTML = `
        <style>
            .session-panel { margin-bottom: 1rem; }
            .session-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(220px, 1fr));
                gap: 12px 16px;
                margin-top: 0.5rem;
            }
            .session-field {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .session-field label {
                font-size: 0.85rem;
                font-weight: 600;
            }
            .session-field input,
            .session-field select {
                padding: 6px 8px;
                font-size: 1rem;
                width: 100%;
                box-sizing: border-box;
            }
            @media (max-width: 768px) {
                .session-grid { grid-template-columns: 1fr; }
            }
        </style>
        <div class="session-panel">
            <h2>Test Session</h2>
            <div class="session-grid">
                <div class="session-field">
                    <label for="s-tester">Tester</label>
                    <input id="s-tester" value="Tester-1" />
                </div>
                <div class="session-field">
                    <label for="s-language">Language</label>
                    <select id="s-language">
                        <option value="ru-RU">🇷🇺 Русский (ru-RU)</option>
                        <option value="en-US" selected>🇬🇧 English (en-US)</option>
                        <option value="fr-FR">🇫🇷 Français (fr-FR)</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-recognition">Recognition Provider</label>
                    <select id="s-recognition">
                        <option value="Browser" selected>Browser</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Azure">Azure</option>
                        <option value="Google">Google</option>
                        <option value="Whisper">Whisper</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-speech">Speech Provider</label>
                    <select id="s-speech">
                        <option value="Browser" selected>Browser</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Azure">Azure</option>
                        <option value="Google">Google</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-scenario-set">Scenario Set</label>
                    <input id="s-scenario-set" value="builtin" />
                </div>
                <div class="session-field">
                    <label for="s-build">Build</label>
                    <input id="s-build" value="1.0.0" />
                </div>
                <div class="session-field">
                    <label for="s-commit">Commit</label>
                    <input id="s-commit" value="bafc789" />
                </div>
                <div class="session-field">
                    <label for="s-env">Environment</label>
                    <input id="s-env" value="demo" />
                </div>
                <div class="session-field">
                    <label for="s-backend-url">Backend URL</label>
                    <input id="s-backend-url" value="https://ibronevik.ru/taxi/c/gruzvill/" />
                </div>
                <div class="session-field">
                    <label for="s-login">Login</label>
                    <input id="s-login" value="testvoiceee@gmail.com" />
                </div>
                <div class="session-field">
                    <label for="s-password">Password</label>
                    <input id="s-password" type="password" value="tyler8787" />
                </div>
            </div>
        </div>
    `

    return (): SessionMeta => ({
        tester: (root.querySelector<HTMLInputElement>("#s-tester")!).value,
        language: (root.querySelector<HTMLSelectElement>("#s-language")!).value,
        recognitionProvider: (root.querySelector<HTMLSelectElement>("#s-recognition")!).value,
        speechProvider: (root.querySelector<HTMLSelectElement>("#s-speech")!).value,
        scenarioSet: (root.querySelector<HTMLInputElement>("#s-scenario-set")!).value,
        build: (root.querySelector<HTMLInputElement>("#s-build")!).value,
        commit: (root.querySelector<HTMLInputElement>("#s-commit")!).value,
        environment: (root.querySelector<HTMLInputElement>("#s-env")!).value,
        backendUrl: (root.querySelector<HTMLInputElement>("#s-backend-url")!).value,
        login: (root.querySelector<HTMLInputElement>("#s-login")!).value,
        password: (root.querySelector<HTMLInputElement>("#s-password")!).value,
    })

}