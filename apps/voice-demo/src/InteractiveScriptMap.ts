/**
 * Validation Bench — Interactive Mode
 *
 * Human-readable script text shown to the tester for each scenario
 * trigger, localized per session language.
 *
 * PR-9d.2 fix: previously the prompt asked the tester to say an exact
 * scripted phrase ("Тестовая фраза 1"), which mixed two different test
 * types — "repeat what's written" vs "recognize an arbitrary phrase".
 * Since the actual recognition/logging pipeline works with whatever
 * the tester really says (not a fixed script), the prompt now simply
 * asks the tester to say any phrase.
 *
 * PR-13: builtin.json is now the Driver Standard Trip scenario set
 * (accept-order / arrived / start-trip / finish-trip / become-available).
 * Scripts below match its `expectedPhrase` fields. Any trigger not
 * listed here (e.g. a custom uploaded ScenarioSet) falls back to a
 * generic prompt — see getInteractiveScript().
 */

export interface InteractiveScript {
    readonly promptText: string
    readonly expectedText: string
}

type ScriptsByTrigger = Record<string, InteractiveScript>

const SCRIPTS_RU: ScriptsByTrigger = {
    "voice.accept-order": {
        promptText: "Произнесите любую фразу",
        expectedText: 'Ожидаемая фраза: «Принять заказ»'
    },
    "voice.arrived": {
        promptText: "Произнесите любую фразу",
        expectedText: 'Ожидаемая фраза: «Я приехал»'
    },
    "voice.start-trip": {
        promptText: "Произнесите любую фразу",
        expectedText: 'Ожидаемая фраза: «Начать поездку»'
    },
    "voice.finish-trip": {
        promptText: "Произнесите любую фразу",
        expectedText: 'Ожидаемая фраза: «Завершить поездку»'
    },
    "voice.available": {
        promptText: "Произнесите любую фразу",
        expectedText: 'Ожидаемая фраза: «Готов к следующему заказу»'
    }
}

const SCRIPTS_EN: ScriptsByTrigger = {
    "voice.accept-order": {
        promptText: "Say any phrase",
        expectedText: 'Expected phrase: "Accept order"'
    },
    "voice.arrived": {
        promptText: "Say any phrase",
        expectedText: 'Expected phrase: "I have arrived"'
    },
    "voice.start-trip": {
        promptText: "Say any phrase",
        expectedText: 'Expected phrase: "Start trip"'
    },
    "voice.finish-trip": {
        promptText: "Say any phrase",
        expectedText: 'Expected phrase: "Finish trip"'
    },
    "voice.available": {
        promptText: "Say any phrase",
        expectedText: 'Expected phrase: "Ready for next order"'
    }
}

const SCRIPTS_FR: ScriptsByTrigger = {
    "voice.accept-order": {
        promptText: "Dites n'importe quelle phrase",
        expectedText: 'Phrase attendue : « Accepter la commande »'
    },
    "voice.arrived": {
        promptText: "Dites n'importe quelle phrase",
        expectedText: 'Phrase attendue : « Je suis arrivé »'
    },
    "voice.start-trip": {
        promptText: "Dites n'importe quelle phrase",
        expectedText: 'Phrase attendue : « Démarrer la course »'
    },
    "voice.finish-trip": {
        promptText: "Dites n'importe quelle phrase",
        expectedText: 'Phrase attendue : « Terminer la course »'
    },
    "voice.available": {
        promptText: "Dites n'importe quelle phrase",
        expectedText: 'Phrase attendue : « Prêt pour la prochaine commande »'
    }
}

const SCRIPTS_AR_MA: ScriptsByTrigger = {
    "voice.accept-order": {
        promptText: "گول أي جملة",
        expectedText: "الجملة المتوقعة: قبول الطلب"
    },
    "voice.arrived": {
        promptText: "گول أي جملة",
        expectedText: "الجملة المتوقعة: وصلت"
    },
    "voice.start-trip": {
        promptText: "گول أي جملة",
        expectedText: "الجملة المتوقعة: بدء الرحلة"
    },
    "voice.finish-trip": {
        promptText: "گول أي جملة",
        expectedText: "الجملة المتوقعة: إنهاء الرحلة"
    },
    "voice.available": {
        promptText: "گول أي جملة",
        expectedText: "الجملة المتوقعة: جاهز للطلب التالي"
    }
}

const SCRIPTS_BY_LANGUAGE: Record<string, ScriptsByTrigger> = {
    "ar-MA": SCRIPTS_AR_MA,
    "ru-RU": SCRIPTS_RU,
    "en-US": SCRIPTS_EN,
    "fr-FR": SCRIPTS_FR
}

export function getInteractiveScript(trigger: string, language: string): InteractiveScript {
    const scripts = SCRIPTS_BY_LANGUAGE[language] ?? SCRIPTS_EN
    return scripts[trigger] ?? {
        promptText: `Perform action: ${trigger}`,
        expectedText: "No expected response defined"
    }
}

const STEP_LABEL_BY_LANGUAGE: Record<string, string> = {
    "ar-MA": "الخطوة",
    "ru-RU": "Шаг",
    "en-US": "Step",
    "fr-FR": "Étape"
}

export function getStepLabel(language: string): string {
    return STEP_LABEL_BY_LANGUAGE[language] ?? STEP_LABEL_BY_LANGUAGE["en-US"]
}
