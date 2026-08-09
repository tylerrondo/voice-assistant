/**
 * Validation Bench UI strings per session language.
 */

import { StepState } from "./StepState"

export interface BenchUiStrings {
    pageTitle: string
    testSession: string
    tester: string
    uiLanguage: string
    voiceLanguage: string
    recognitionProvider: string
    speechProvider: string
    scenarioSet: string
    scenarioSetUpload: string
    build: string
    commit: string
    environment: string
    backendUrl: string
    login: string
    password: string
    backend: string
    mail: string
    validationMode: string
    automatic: string
    interactive: string
    inputSource: string
    inputMic: string
    inputInject: string
    connect: string
    start: string
    stop: string
    runAll: string
    injectAction: string
    send: string
    micIdle: string
    micListening: string
    channelState: string
    progress: string
    interactiveRunner: string
    sessionState: string
    scenario: string
    recognized: string
    speech: string
    nextStep: string
    repeatStep: string
    skipStep: string
    pause: string
    resume: string
    startStep: string
    startListening: string
    recognizedQuestion: string
    recognizedYes: string
    recognizedNo: string
    heardQuestion: string
    heardYes: string
    heardNo: string
    testerComment: string
    saveComment: string
    commentUnsaved: string
    commentSaved: string
    commentNotSaved: string
    sessionSummary: string
    startNewSession: string
    allScenariosDone: string
    summaryTotal: string
    summaryConfirmed: string
    summaryWarnings: string
    summaryRepeats: string
    summarySkipped: string
    verification: string
    executionLog: string
    lastCompletedReport: string
    reportPreviewHint: string
    jsonReport: string
    reportHistory: string
    downloadJson: string
    uploadJson: string
    uploadJsonLoaded: string
    // PR-11: External JSON Scenarios
    scenarioSourceLabel: string
    scenarioSourceBuiltin: string
    scenarioSourceFile: string
    chooseScenarioFile: string
    scenarioFileLabel: string
    alertUploadInvalidJson: string
    sendReport: string
    generatedAt: string
    status: string
    mode: string
    inputSourceShort: string
    recognition: string
    speechLabel: string
    scenarios: string
    passed: string
    failed: string
    duration: string
    alertRunAllFirst: string
    alertSendNoEmail: string
    alertSendSuccess: string
    alertSendFailed: string
    connConnected: string
    connFailedPrefix: string
    mailReady: string
    stepStates: Record<StepState, string>
}

const EN: BenchUiStrings = {
    pageTitle: "Validation Bench",
    testSession: "Test Session",
    tester: "Tester",
    uiLanguage: "UI Language",
    voiceLanguage: "Voice Language",
    recognitionProvider: "Recognition Provider",
    speechProvider: "Speech Provider",
    scenarioSet: "Scenario Set",
    scenarioSetUpload: "Upload",
    build: "Build",
    commit: "Commit",
    environment: "Environment",
    backendUrl: "Backend URL",
    login: "Login",
    password: "Password",
    backend: "Backend",
    mail: "Mail",
    validationMode: "Validation Mode",
    automatic: "Automatic",
    interactive: "Interactive",
    inputSource: "Input Source",
    inputMic: "🎤 Browser microphone",
    inputInject: "Inject Action (debug)",
    connect: "Connect",
    start: "▶ Start",
    stop: "■ Stop",
    runAll: "▶ Run All",
    injectAction: "Inject action:",
    send: "Send",
    micIdle: "🎤 Idle",
    micListening: "🎤 Listening — say the phrase now…",
    channelState: "Channel State",
    progress: "Progress",
    interactiveRunner: "Interactive Runner",
    sessionState: "Session State",
    scenario: "Scenario",
    recognized: "Recognized",
    speech: "Speech",
    nextStep: "▶ Next Step",
    repeatStep: "↺ Repeat Step",
    skipStep: "⏭ Skip Step",
    pause: "⏸ Pause",
    resume: "⏵ Resume",
    startStep: "▶ Start Step",
    startListening: "🎤 Start Listening",
    recognizedQuestion: "Recognized correctly?",
    recognizedYes: "✓ Correct",
    recognizedNo: "✗ Incorrect",
    heardQuestion: "Expected speech heard?",
    heardYes: "✓ Heard",
    heardNo: "✗ Not heard",
    testerComment: "Tester comment:",
    saveComment: "Save comment",
    commentUnsaved: "Unsaved changes",
    commentSaved: "✓ Saved",
    commentNotSaved: "Not saved",
    sessionSummary: "Session Summary",
    startNewSession: "↻ Start New Session",
    allScenariosDone: "All scenarios completed.",
    summaryTotal: "Total scenarios",
    summaryConfirmed: "Fully confirmed",
    summaryWarnings: "With mismatches",
    summaryRepeats: "Repeats",
    summarySkipped: "Skipped",
    verification: "Verification",
    executionLog: "Execution Log",
    lastCompletedReport: "Last Completed Report",
    reportPreviewHint: "Run All or finish an Interactive session to view a report here.",
    jsonReport: "JSON Report",
    reportHistory: "Report History",
    downloadJson: "Download JSON",
    uploadJson: "Upload",
    uploadJsonLoaded: "Loaded",
    scenarioSourceLabel: "Scenario Source:",
    scenarioSourceBuiltin: "Built-in",
    scenarioSourceFile: "JSON File",
    chooseScenarioFile: "Choose File...",
    scenarioFileLabel: "Scenario File:",
    alertUploadInvalidJson: "Invalid JSON file",
    sendReport: "Send Report",
    generatedAt: "Generated at",
    status: "Status",
    mode: "Mode",
    inputSourceShort: "Input Source",
    recognition: "Recognition",
    speechLabel: "Speech",
    scenarios: "Scenarios",
    passed: "Passed",
    failed: "Failed",
    duration: "Duration",
    alertRunAllFirst: "Run All first!",
    alertSendNoEmail: "❌ Send failed: no email id available",
    alertSendSuccess: "✅ Report sent!",
    alertSendFailed: "❌ Send failed!",
    connConnected: "● Connected",
    connFailedPrefix: "✗",
    mailReady: "Ready",
    stepStates: {
        [StepState.Idle]: "idle",
        [StepState.WaitingTester]: "waiting-tester",
        [StepState.Running]: "running",
        [StepState.Paused]: "paused",
        [StepState.Finished]: "finished"
    }
}

const RU: BenchUiStrings = {
    ...EN,
    pageTitle: "Validation Bench",
    testSession: "Тестовая сессия",
    tester: "Тестировщик",
    uiLanguage: "Язык интерфейса",
    voiceLanguage: "Язык голоса",
    recognitionProvider: "Провайдер распознавания",
    speechProvider: "Провайдер речи",
    scenarioSet: "Набор сценариев",
    scenarioSetUpload: "Загрузка",
    build: "Сборка",
    commit: "Коммит",
    environment: "Окружение",
    backendUrl: "URL бэкенда",
    login: "Логин",
    password: "Пароль",
    backend: "Бэкенд",
    mail: "Почта",
    validationMode: "Режим проверки",
    automatic: "Автоматический",
    interactive: "Интерактивный",
    inputSource: "Источник ввода",
    inputMic: "🎤 Микрофон браузера",
    inputInject: "Inject Action (отладка)",
    connect: "Подключить",
    start: "▶ Старт",
    stop: "■ Стоп",
    runAll: "▶ Run All",
    injectAction: "Inject action:",
    send: "Отправить",
    micIdle: "🎤 Ожидание",
    micListening: "🎤 Слушаю — произнесите фразу…",
    channelState: "Состояние канала",
    progress: "Прогресс",
    interactiveRunner: "Interactive Runner",
    sessionState: "Состояние сессии",
    scenario: "Сценарий",
    recognized: "Распознано",
    speech: "Речь",
    nextStep: "▶ Следующий шаг",
    repeatStep: "↺ Повторить шаг",
    skipStep: "⏭ Пропустить шаг",
    pause: "⏸ Пауза",
    resume: "⏵ Продолжить",
    startStep: "▶ Начать шаг",
    startListening: "🎤 Начать прослушивание",
    recognizedQuestion: "Распознано верно?",
    recognizedYes: "✓ Верно",
    recognizedNo: "✗ Неверно",
    heardQuestion: "Ожидаемая речь услышана?",
    heardYes: "✓ Услышал",
    heardNo: "✗ Не услышал",
    testerComment: "Комментарий тестировщика:",
    saveComment: "Сохранить комментарий",
    commentUnsaved: "Есть несохранённые изменения",
    commentSaved: "✓ Сохранено",
    commentNotSaved: "Не сохранён",
    sessionSummary: "Итоги сессии",
    startNewSession: "↻ Новая сессия",
    allScenariosDone: "Все сценарии пройдены.",
    summaryTotal: "Всего сценариев",
    summaryConfirmed: "Подтверждено полностью",
    summaryWarnings: "С расхождениями",
    summaryRepeats: "Повторов",
    summarySkipped: "Пропущено",
    verification: "Verification",
    executionLog: "Execution Log",
    lastCompletedReport: "Последний отчёт",
    reportPreviewHint: "Чтобы просмотреть отчёт, сначала нажмите «Run All» или завершите Interactive-сессию.",
    jsonReport: "JSON Report",
    reportHistory: "История отчётов",
    downloadJson: "Скачать JSON",
    uploadJson: "Загрузить",
    uploadJsonLoaded: "Загружено",
    scenarioSourceLabel: "Источник сценариев:",
    scenarioSourceBuiltin: "Встроенные",
    scenarioSourceFile: "JSON-файл",
    chooseScenarioFile: "Выбрать файл...",
    scenarioFileLabel: "Файл сценариев:",
    alertUploadInvalidJson: "Некорректный JSON-файл",
    sendReport: "Отправить отчёт",
    generatedAt: "Сформирован",
    status: "Статус",
    mode: "Режим",
    inputSourceShort: "Источник ввода",
    recognition: "Распознавание",
    speechLabel: "Речь",
    scenarios: "Сценарии",
    passed: "Успешно",
    failed: "Ошибки",
    duration: "Длительность",
    alertRunAllFirst: "Сначала выполните Run All!",
    alertSendNoEmail: "❌ Отправка не удалась: email id недоступен",
    alertSendSuccess: "✅ Отчёт отправлен!",
    alertSendFailed: "❌ Отправка не удалась!",
    connConnected: "● Подключено",
    connFailedPrefix: "✗",
    mailReady: "Готово",
    stepStates: {
        [StepState.Idle]: "idle",
        [StepState.WaitingTester]: "waiting-tester",
        [StepState.Running]: "running",
        [StepState.Paused]: "paused",
        [StepState.Finished]: "finished"
    }
}

const FR: BenchUiStrings = {
    ...EN,
    pageTitle: "Validation Bench",
    testSession: "Session de test",
    tester: "Testeur",
    uiLanguage: "Langue de l'interface",
    voiceLanguage: "Langue vocale",
    recognitionProvider: "Fournisseur de reconnaissance",
    speechProvider: "Fournisseur de synthèse",
    scenarioSet: "Jeu de scénarios",
    scenarioSetUpload: "Téléchargement",
    build: "Build",
    commit: "Commit",
    environment: "Environnement",
    backendUrl: "URL backend",
    login: "Identifiant",
    password: "Mot de passe",
    backend: "Backend",
    mail: "Mail",
    validationMode: "Mode de validation",
    automatic: "Automatique",
    interactive: "Interactif",
    inputSource: "Source d'entrée",
    inputMic: "🎤 Microphone du navigateur",
    inputInject: "Inject Action (debug)",
    connect: "Connecter",
    start: "▶ Démarrer",
    stop: "■ Arrêter",
    runAll: "▶ Tout exécuter",
    injectAction: "Action injectée :",
    send: "Envoyer",
    micIdle: "🎤 Inactif",
    micListening: "🎤 Écoute — dites la phrase…",
    channelState: "État du canal",
    progress: "Progression",
    interactiveRunner: "Interactive Runner",
    sessionState: "État de session",
    scenario: "Scénario",
    recognized: "Reconnu",
    speech: "Parole",
    nextStep: "▶ Étape suivante",
    repeatStep: "↺ Répéter l'étape",
    skipStep: "⏭ Ignorer l'étape",
    pause: "⏸ Pause",
    resume: "⏵ Reprendre",
    startStep: "▶ Démarrer l'étape",
    startListening: "🎤 Commencer l'écoute",
    recognizedQuestion: "Reconnaissance correcte ?",
    recognizedYes: "✓ Correct",
    recognizedNo: "✗ Incorrect",
    heardQuestion: "Parole attendue entendue ?",
    heardYes: "✓ Entendu",
    heardNo: "✗ Non entendu",
    testerComment: "Commentaire du testeur :",
    saveComment: "Enregistrer le commentaire",
    commentUnsaved: "Modifications non enregistrées",
    commentSaved: "✓ Enregistré",
    commentNotSaved: "Non enregistré",
    sessionSummary: "Résumé de session",
    startNewSession: "↻ Nouvelle session",
    allScenariosDone: "Tous les scénarios sont terminés.",
    summaryTotal: "Scénarios au total",
    summaryConfirmed: "Entièrement confirmés",
    summaryWarnings: "Avec écarts",
    summaryRepeats: "Répétitions",
    summarySkipped: "Ignorés",
    verification: "Verification",
    executionLog: "Execution Log",
    lastCompletedReport: "Dernier rapport",
    reportPreviewHint: "Exécutez Run All ou terminez une session Interactive pour voir un rapport ici.",
    jsonReport: "JSON Report",
    reportHistory: "Historique des rapports",
    downloadJson: "Télécharger JSON",
    uploadJson: "Charger",
    uploadJsonLoaded: "Chargé",
    scenarioSourceLabel: "Source des scénarios :",
    scenarioSourceBuiltin: "Intégré",
    scenarioSourceFile: "Fichier JSON",
    chooseScenarioFile: "Choisir un fichier...",
    scenarioFileLabel: "Fichier de scénarios :",
    alertUploadInvalidJson: "Fichier JSON invalide",
    sendReport: "Envoyer le rapport",
    generatedAt: "Généré le",
    status: "Statut",
    mode: "Mode",
    inputSourceShort: "Source d'entrée",
    recognition: "Reconnaissance",
    speechLabel: "Synthèse",
    scenarios: "Scénarios",
    passed: "Réussis",
    failed: "Échoués",
    duration: "Durée",
    alertRunAllFirst: "Exécutez d'abord Run All !",
    alertSendNoEmail: "❌ Échec d'envoi : aucun identifiant email",
    alertSendSuccess: "✅ Rapport envoyé !",
    alertSendFailed: "❌ Échec d'envoi !",
    connConnected: "● Connecté",
    connFailedPrefix: "✗",
    mailReady: "Prêt",
    stepStates: EN.stepStates
}

const AR_MA: BenchUiStrings = {
    pageTitle: "منصة التحقق",
    testSession: "جلسة الاختبار",
    tester: "المختبر",
    uiLanguage: "لغة الواجهة",
    voiceLanguage: "لغة الصوت",
    recognitionProvider: "مزود التعرف الصوتي",
    speechProvider: "مزود النطق",
    scenarioSet: "مجموعة السيناريوهات",
    scenarioSetUpload: "رفع",
    build: "الإصدار",
    commit: "الالتزام",
    environment: "البيئة",
    backendUrl: "رابط الخادم",
    login: "اسم المستخدم",
    password: "كلمة المرور",
    backend: "الخادم",
    mail: "البريد",
    validationMode: "وضع التحقق",
    automatic: "تلقائي",
    interactive: "تفاعلي",
    inputSource: "مصدر الإدخال",
    inputMic: "🎤 ميكروفون المتصفح",
    inputInject: "حقن الإجراء (تصحيح)",
    connect: "تّصل",
    start: "▶ بدا",
    stop: "■ وقّف",
    runAll: "▶ شغّل كولشي",
    injectAction: "حقن الإجراء:",
    send: "صيفط",
    micIdle: "🎤 كيسنّى",
    micListening: "🎤 راه تسنّى — گول الجملة دابا…",
    channelState: "حالة القناة",
    progress: "التقدّم",
    interactiveRunner: "التشغيل التفاعلي",
    sessionState: "حالة الجلسة",
    scenario: "السيناريو",
    recognized: "المتعرف عليه",
    speech: "النطق",
    nextStep: "▶ الخطوة الجاية",
    repeatStep: "↺ عاود الخطوة",
    skipStep: "⏭ تجاوز الخطوة",
    pause: "⏸ وقف",
    resume: "⏵ كمل",
    startStep: "▶ بدا الخطوة",
    startListening: "🎤 بدا تسمع",
    recognizedQuestion: "التعرف صحيح؟",
    recognizedYes: "✓ صحيح",
    recognizedNo: "✗ غلط",
    heardQuestion: "سمعت النطق المتوقع؟",
    heardYes: "✓ سمعت",
    heardNo: "✗ ما سمعتش",
    testerComment: "تعليق المختبر:",
    saveComment: "حفظ التعليق",
    commentUnsaved: "تغييرات ما تحفظاتش",
    commentSaved: "✓ تحفظ",
    commentNotSaved: "ما تحفظش",
    sessionSummary: "ملخص الجلسة",
    startNewSession: "↻ جلسة جديدة",
    allScenariosDone: "كملت كاملين السيناريوهات.",
    summaryTotal: "مجموع السيناريوهات",
    summaryConfirmed: "مؤكد بالكامل",
    summaryWarnings: "مع اختلافات",
    summaryRepeats: "التكرارات",
    summarySkipped: "المتجاوزة",
    verification: "التحقق",
    executionLog: "سجل التنفيذ",
    lastCompletedReport: "آخر تقرير مكتمل",
    reportPreviewHint: "شغّل الكل أو كمّل جلسة تفاعلية باش تشوف التقرير هنا.",
    jsonReport: "تقرير JSON",
    reportHistory: "سجل التقارير",
    downloadJson: "تحميل JSON",
    uploadJson: "رفع",
    uploadJsonLoaded: "تم التحميل",
    scenarioSourceLabel: "مصدر السيناريوهات:",
    scenarioSourceBuiltin: "مدمج",
    scenarioSourceFile: "ملف JSON",
    chooseScenarioFile: "اختيار ملف...",
    scenarioFileLabel: "ملف السيناريوهات:",
    alertUploadInvalidJson: "ملف JSON غير صالح",
    sendReport: "إرسال التقرير",
    generatedAt: "تولّد في",
    status: "الحالة",
    mode: "الوضع",
    inputSourceShort: "مصدر الإدخال",
    recognition: "التعرف",
    speechLabel: "النطق",
    scenarios: "السيناريوهات",
    passed: "ناجح",
    failed: "فاشل",
    duration: "المدة",
    alertRunAllFirst: "خاصك تشغّل الكل أولاً!",
    alertSendNoEmail: "❌ فشل الإرسال: ما كاينش معرف البريد",
    alertSendSuccess: "✅ التقرير تّصيفط!",
    alertSendFailed: "❌ فشل الإرسال!",
    connConnected: "● متصل",
    connFailedPrefix: "✗",
    mailReady: "جاهز",
    stepStates: EN.stepStates
}

const STRINGS_BY_LANGUAGE: Record<string, BenchUiStrings> = {
    "ar-MA": AR_MA,
    "en-US": EN,
    "ru-RU": RU,
    "fr-FR": FR
}

export function getBenchUiStrings(language: string): BenchUiStrings {
    return STRINGS_BY_LANGUAGE[language] ?? EN
}

export function formatRunningScenario(language: string, current: number, total: number): string {
    switch (language) {
        case "ar-MA":
            return `السيناريو ${current} من ${total}`
        case "ru-RU":
            return `Сценарий ${current} из ${total}`
        case "fr-FR":
            return `Scénario ${current} sur ${total}`
        default:
            return `Running scenario ${current} of ${total}`
    }
}

export function getProgressDoneLabel(language: string): string {
    switch (language) {
        case "ar-MA":
            return "تم"
        case "ru-RU":
            return "Готово"
        case "fr-FR":
            return "Terminé"
        default:
            return "Done"
    }
}

export function formatValidationModeLabel(mode: string, language: string): string {
    const ui = getBenchUiStrings(language)
    if (mode === "Automatic") return ui.automatic
    if (mode === "Interactive") return ui.interactive
    return mode
}

export function applySessionPanelLabels(sessionRoot: HTMLElement, ui: BenchUiStrings): void {
    const title = sessionRoot.querySelector<HTMLElement>("#session-panel-title")
    if (title) title.textContent = ui.testSession

    const labels: Array<[string, string]> = [
        ["s-tester", ui.tester],
        ["s-ui-language", ui.uiLanguage],
        ["s-voice-language", ui.voiceLanguage],
        ["s-recognition", ui.recognitionProvider],
        ["s-speech", ui.speechProvider],
        ["s-scenario-set", ui.scenarioSet],
        ["s-build", ui.build],
        ["s-commit", ui.commit],
        ["s-env", ui.environment],
        ["s-backend-url", ui.backendUrl],
        ["s-login", ui.login],
        ["s-password", ui.password]
    ]

    for (const [forId, text] of labels) {
        const label = sessionRoot.querySelector<HTMLLabelElement>(`label[for="${forId}"]`)
        if (label) label.textContent = text
    }

    const scenarioSetSelect = sessionRoot.querySelector<HTMLSelectElement>("#s-scenario-set")
    if (scenarioSetSelect && scenarioSetSelect.options.length >= 2) {
        scenarioSetSelect.options[0].text = ui.automatic
        scenarioSetSelect.options[1].text = ui.scenarioSetUpload
    }
}
