/**
 * Validation Bench
 *
 * Test Session configuration panel with controlled dropdowns.
 */

export interface SessionMeta {
    tester: string
    uiLanguage: string
    voiceLanguage: string
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

const LANGUAGE_OPTIONS_HTML = `
                        <option value="ar-MA">🇲🇦 الدارجة (ar-MA)</option>
                        <option value="fr-FR">🇫🇷 Français (fr-FR)</option>
                        <option value="en-US" selected>🇬🇧 English (en-US)</option>
                        <option value="ru-RU">🇷🇺 Русский (ru-RU)</option>
`

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
            <h2 id="session-panel-title">Test Session</h2>
            <div class="session-grid">
                <div class="session-field">
                    <label for="s-tester">Tester</label>
                    <input id="s-tester" data-testid="session-tester" value="Tester-1" />
                </div>
                <div class="session-field">
                    <label for="s-ui-language">UI Language</label>
                    <select id="s-ui-language" data-testid="session-ui-language">
                        ${LANGUAGE_OPTIONS_HTML}
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-voice-language">Voice Language</label>
                    <select id="s-voice-language" data-testid="session-voice-language">
                        ${LANGUAGE_OPTIONS_HTML}
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-recognition">Recognition Provider</label>
                    <select id="s-recognition" data-testid="session-recognition-provider">
                        <option value="Browser" selected>Browser</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Azure">Azure</option>
                        <option value="Google">Google</option>
                        <option value="Whisper">Whisper</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-speech">Speech Provider</label>
                    <select id="s-speech" data-testid="session-speech-provider">
                        <option value="Browser" selected>Browser</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Azure">Azure</option>
                        <option value="Google">Google</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-scenario-set">Scenario Set</label>
                    <select id="s-scenario-set" data-testid="session-scenario-set">
                        <option value="automatic" selected>Automatic</option>
                        <option value="upload">Upload</option>
                    </select>
                </div>
                <div class="session-field">
                    <label for="s-build">Build</label>
                    <input id="s-build" data-testid="session-build" value="1.0.0" />
                </div>
                <div class="session-field">
                    <label for="s-commit">Commit</label>
                    <input id="s-commit" data-testid="session-commit" value="bafc789" />
                </div>
                <div class="session-field">
                    <label for="s-env">Environment</label>
                    <input id="s-env" data-testid="session-env" value="demo" />
                </div>
                <div class="session-field">
                    <label for="s-backend-url">Backend URL</label>
                    <input id="s-backend-url" data-testid="session-backend-url" value="https://ibronevik.ru/taxi/c/gruzvill/" />
                </div>
                <div class="session-field">
                    <label for="s-login">Login</label>
                    <input id="s-login" data-testid="session-login" value="testvoiceee@gmail.com" />
                </div>
                <div class="session-field">
                    <label for="s-password">Password</label>
                    <input id="s-password" data-testid="session-password" type="password" value="tyler8787" />
                </div>
            </div>
        </div>
    `

    return (): SessionMeta => ({
        tester: (root.querySelector<HTMLInputElement>("#s-tester")!).value,
        uiLanguage: (root.querySelector<HTMLSelectElement>("#s-ui-language")!).value,
        voiceLanguage: (root.querySelector<HTMLSelectElement>("#s-voice-language")!).value,
        recognitionProvider: (root.querySelector<HTMLSelectElement>("#s-recognition")!).value,
        speechProvider: (root.querySelector<HTMLSelectElement>("#s-speech")!).value,
        scenarioSet: (root.querySelector<HTMLSelectElement>("#s-scenario-set")!).value,
        build: (root.querySelector<HTMLInputElement>("#s-build")!).value,
        commit: (root.querySelector<HTMLInputElement>("#s-commit")!).value,
        environment: (root.querySelector<HTMLInputElement>("#s-env")!).value,
        backendUrl: (root.querySelector<HTMLInputElement>("#s-backend-url")!).value,
        login: (root.querySelector<HTMLInputElement>("#s-login")!).value,
        password: (root.querySelector<HTMLInputElement>("#s-password")!).value,
    })

}