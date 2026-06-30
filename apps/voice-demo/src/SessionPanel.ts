/**
 * Validation Bench
 *
 * Test Session configuration panel.
 * Collects tester metadata before the session starts.
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
            .session-field input {
                padding: 6px 8px;
                font-size: 1rem;
                width: 100%;
                box-sizing: border-box;
            }
            @media (max-width: 768px) {
                .session-grid {
                    grid-template-columns: 1fr;
                }
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
                    <input id="s-language" value="ru-RU" />
                </div>
                <div class="session-field">
                    <label for="s-recognition">Recognition Provider</label>
                    <input id="s-recognition" value="Browser" />
                </div>
                <div class="session-field">
                    <label for="s-speech">Speech Provider</label>
                    <input id="s-speech" value="Browser" />
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
    })

}