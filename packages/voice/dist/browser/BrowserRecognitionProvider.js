export class BrowserRecognitionProvider {
    recognition;
    listeners = new Set();
    /**
     * PR-9d.2 fix: the Web Speech API's stop() is asynchronous under
     * the hood — the real "end" of the session only happens when the
     * 'onend' event fires, some time after recognition.stop() is
     * called. The previous implementation resolved stop() immediately
     * without waiting for that, so callers doing
     * `await stop(); await start()` back-to-back (as the Interactive
     * Runner does between steps) could start a new session before the
     * browser had actually finished the previous one. That race
     * occasionally caused the engine to deliver the same result twice
     * (observed as a duplicated Action/Event/Speak triple for a single
     * spoken step). stop() now properly waits for the real 'onend'
     * event before resolving, so start() is never called while a
     * previous session is still winding down.
     */
    isActive = false;
    pendingEndResolvers = [];
    constructor(language = "ru-RU") {
        this.recognition = this.createRecognition();
        this.configureRecognition(language);
        this.bindEvents();
    }
    async start() {
        // Only track as "active" (awaiting a real onend) when actually
        // supported — otherwise stop() would wait forever for an
        // 'onend' event that the no-op stub will never fire.
        this.isActive = this.isSupported;
        this.recognition.start();
    }
    async stop() {
        if (!this.isActive) {
            return;
        }
        await new Promise((resolve) => {
            this.pendingEndResolvers.push(resolve);
            this.recognition.stop();
        });
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    setLanguage(language) {
        this.recognition.lang = language;
    }
    /**
     * PR-10 fix: WebKit/Safari (and Playwright's WebKit project) do
     * not implement the SpeechRecognition API at all. The constructor
     * previously threw immediately in that case, which crashed the
     * ENTIRE app on load (not just the mic feature) — since
     * Bootstrap.ts constructs this provider eagerly, before the user
     * ever touches mic-related UI. This now falls back to a no-op
     * stub instead of throwing, so the rest of Validation Bench (all
     * Automatic / Inject Action functionality) still works fine on
     * browsers without speech recognition support. Real microphone
     * input simply won't produce results there, which is an inherent
     * platform limitation, not a bug.
     */
    isSupported = true;
    createRecognition() {
        const Ctor = window.SpeechRecognition ??
            window.webkitSpeechRecognition;
        if (!Ctor) {
            console.warn("SpeechRecognition API is not supported in this browser. " +
                "Real microphone input will be unavailable; Automatic/Inject Action modes are unaffected.");
            this.isSupported = false;
            return {
                lang: "",
                interimResults: false,
                maxAlternatives: 1,
                continuous: false,
                start: () => { },
                stop: () => { },
                onresult: null,
                onerror: null,
                onend: null
            };
        }
        return new Ctor();
    }
    configureRecognition(language) {
        this.recognition.lang = language;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;
        this.recognition.continuous = false;
    }
    bindEvents() {
        this.recognition.onresult = (event) => {
            this.handleResult(event);
        };
        this.recognition.onerror = () => {
            // Intentionally left empty: this provider does not decide
            // how errors should be surfaced to the application. A
            // dedicated error channel can be added to the contract later.
            // Note: onerror is typically followed by onend, which will
            // still resolve any pending stop() waiters below.
        };
        this.recognition.onend = () => {
            this.isActive = false;
            const resolvers = this.pendingEndResolvers;
            this.pendingEndResolvers = [];
            resolvers.forEach((resolve) => resolve());
        };
    }
    handleResult(event) {
        const resultItem = event.results.item(event.resultIndex);
        if (!resultItem || resultItem.length === 0) {
            return;
        }
        const alternative = resultItem.item(0);
        if (!alternative) {
            return;
        }
        const result = {
            text: alternative.transcript,
            confidence: alternative.confidence,
            language: this.recognition.lang
        };
        for (const listener of this.listeners) {
            listener(result);
        }
    }
}
//# sourceMappingURL=BrowserRecognitionProvider.js.map