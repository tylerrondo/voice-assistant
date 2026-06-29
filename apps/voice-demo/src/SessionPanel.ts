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
    backendUrl: string
    login: string
    password: string
}
export function renderSessionPanel(root: HTMLElement): () => SessionMeta {
    root.innerHTML = `
        <div class="session-panel">
            <h2>Test Session</h2>
            <label>Tester <input id="s-tester" value="Tester-1" /></label>
            <label>Language <input id="s-language" value="en-US" /></label>
            <label>Recognition Provider <input id="s-recognition" value="Browser" /></label>
            <label>Speech Provider <input id="s-speech" value="Browser" /></label>
            <label>Scenario Set <input id="s-scenario-set" value="builtin" /></label>
            <label>Build <input id="s-build" value="1.0.0" /></label>
            <label>Commit <input id="s-commit" value="bafc789" /></label>
            <label>Environment <input id="s-env" value="demo" /></label>
            <label>Backend URL <input id="s-backend-url" value="" /></label>
            <label>Login <input id="s-login" value="" /></label>
            <label>Password <input id="s-password" type="password" value="" /></label>
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