/**
 * Validation Bench — Interactive Mode
 *
 * Human-readable script text shown to the tester for each scenario
 * trigger, localized per session language.
 */

export interface InteractiveScript {
    readonly promptText: string
    readonly expectedText: string
}

type ScriptsByTrigger = Record<string, InteractiveScript>

const SCRIPTS_RU: ScriptsByTrigger = {
    "voice.recognized": {
        promptText: "Скажите: \"Тестовая фраза 1\"",
        expectedText: "Ожидаемый ответ: подтверждение распознавания"
    },
    "interaction.echo": {
        promptText: "Скажите: \"Тестовая фраза 2\"",
        expectedText: "Ожидаемый ответ: эхо-повтор фразы"
    },
    "interaction.delayed": {
        promptText: "Скажите: \"Тестовая фраза 3\"",
        expectedText: "Ожидаемый ответ: ответ с задержкой"
    }
}

const SCRIPTS_EN: ScriptsByTrigger = {
    "voice.recognized": {
        promptText: "Say: \"Test phrase 1\"",
        expectedText: "Expected response: recognition confirmed"
    },
    "interaction.echo": {
        promptText: "Say: \"Test phrase 2\"",
        expectedText: "Expected response: echo of the phrase"
    },
    "interaction.delayed": {
        promptText: "Say: \"Test phrase 3\"",
        expectedText: "Expected response: delayed reply"
    }
}

const SCRIPTS_FR: ScriptsByTrigger = {
    "voice.recognized": {
        promptText: "Dites : « Phrase de test 1 »",
        expectedText: "Réponse attendue : reconnaissance confirmée"
    },
    "interaction.echo": {
        promptText: "Dites : « Phrase de test 2 »",
        expectedText: "Réponse attendue : écho de la phrase"
    },
    "interaction.delayed": {
        promptText: "Dites : « Phrase de test 3 »",
        expectedText: "Réponse attendue : réponse différée"
    }
}

const SCRIPTS_BY_LANGUAGE: Record<string, ScriptsByTrigger> = {
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