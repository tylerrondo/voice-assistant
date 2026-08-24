# Canonical Accepted Scenarios Registry (TASK-REPO-001)

Реестр канонических принятых сценариев голосовой платформы голосового ассистента водителя такси.

---

## Сводная таблица принятых сценариев

| SC-ID | Название | Статус | Contract Test | Runtime E2E | Playwright Report (RAW) | Acceptance Commit / Ref |
|---|---|---|---|---|---|---|
| **SC-001** | Базовая голосовая команда (Single-Turn) | **ACCEPTED** | [`sc-001-basic-voice.spec.ts`](../../tests/contract/scenarios/sc-001-basic-voice.spec.ts) | [`sc-001-basic-voice.spec.ts`](../../tests/e2e/scenarios/sc-001-basic-voice.spec.ts) | [`playwright-report-sc-001.json`](../../playwright-report-sc-001.json) | ТЗ-VOICE-SC-001 |
| **SC-002** | Параметризованные голосовые команды | **ACCEPTED** | [`sc-002-parameterized.spec.ts`](../../tests/contract/scenarios/sc-002-parameterized.spec.ts) | [`sc-002-parameterized.spec.ts`](../../tests/e2e/scenarios/sc-002-parameterized.spec.ts) | [`playwright-report-sc-002.json`](../../playwright-report-sc-002.json) | ТЗ-VOICE-SC-002 |
| **SC-003** | Последовательное управление Taxi FSM | **ACCEPTED** | [`sc-003-taxi-fsm.spec.ts`](../../tests/contract/scenarios/sc-003-taxi-fsm.spec.ts) | [`sc-003-taxi-fsm.spec.ts`](../../tests/e2e/scenarios/sc-003-taxi-fsm.spec.ts) | [`playwright-report-sc-003.json`](../../playwright-report-sc-003.json) | ТЗ-VOICE-SC-003 |
| **SC-004** | Многошаговый диалог водителя (Slot-Filling) | **ACCEPTED** | [`sc-004-taxi-driver-dialogue.spec.ts`](../../tests/contract/scenarios/sc-004-taxi-driver-dialogue.spec.ts) | [`sc-004-taxi-driver-dialogue.spec.ts`](../../tests/e2e/scenarios/sc-004-taxi-driver-dialogue.spec.ts) | [`playwright-report-sc-004.json`](../../playwright-report-sc-004.json) | ТЗ-VOICE-SC-004 |

---

## Платформенные контракты ядра

| Компонент | Назначение | Контрактный тест | Платформенный E2E | Отчёт |
|---|---|---|---|---|
| **PLATFORM-005** | Dialogue State & Slot-Filling Engine | [`dialogue-state.spec.ts`](../../tests/contract/platform/dialogue-state.spec.ts) | [`dialogue-state.spec.ts`](../../tests/e2e/platform/dialogue-state.spec.ts) | [`playwright-report-dialogue-state.json`](../../playwright-report-dialogue-state.json) |

---

## Правила реестра
1. Все принятые сценарии хранятся в формате **Platform Scenario Specification v2.0**.
2. Изменение принятых спецификаций и тестов запрещено без отдельного ТЗ на миграцию.
3. Все ссылки ведут на каноническую структуру `tests/contract/...`, `tests/e2e/...` и корневые машинные JSON-отчёты.
