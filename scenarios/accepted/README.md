# Канонический Реестр Принятых Сценариев (Accepted Scenarios Registry)

В данном реестре зафиксированы все официально принятые эталонные сценарии голосового ассистента водителя такси, прошедшие аудит спецификации, контрактные тесты и строгие Runtime E2E тесты с оригинальными машинными отчётами Playwright.

| Сценарий | Название и назначение | Статус | Спецификация | Контрактный тест | Тесты Runtime E2E | Отчёт Playwright (RAW) |
|---|---|---|---|---|---|---|
| **SC-001** | Taxi Driver Simple Voice Command (AVAILABLE) | `ACCEPTED` | [JSON](../../scenario-sc-001-simple-command.json) | [Contract](../../tests/contract/scenarios/sc-001-simple-command.spec.ts) | [E2E](../../tests/e2e/scenarios/sc-001-simple-command.spec.ts) | [Report](../../playwright-report-sc-001.json) |
| **SC-002** | Taxi Driver Single Parameter Extraction (orderId) | `ACCEPTED` | [JSON](../../scenario-sc-002-single-param.json) | [Contract](../../tests/contract/scenarios/sc-002-single-param.spec.ts) | [E2E](../../tests/e2e/scenarios/sc-002-single-param.spec.ts) | [Report](../../playwright-report-sc-002.json) |
| **SC-003** | Taxi Driver Clarification Slot Filling (Multi-turn) | `ACCEPTED` | [JSON](../../scenario-sc-003-clarification-slot.json) | [Contract](../../tests/contract/scenarios/sc-003-clarification-slot.spec.ts) | [E2E](../../tests/e2e/scenarios/sc-003-clarification-slot.spec.ts) | [Report](../../playwright-report-sc-003.json) |
| **SC-004** | Taxi Driver Confirmation & Cancellation Flow | `ACCEPTED` | [JSON](../../scenario-sc-004-confirmation-cancel.json) | [Contract](../../tests/contract/scenarios/sc-004-confirmation-cancel.spec.ts) | [E2E](../../tests/e2e/scenarios/sc-004-confirmation-cancel.spec.ts) | [Report](../../playwright-report-sc-004.json) |
| **SC-005** | Taxi Driver Full Trip Multi-Step Workflow | `ACCEPTED` | [JSON](../../scenario-sc-005-taxi-driver-full-trip.json) | [Contract](../../tests/contract/scenarios/sc-005-taxi-driver-full-trip.spec.ts) | [E2E](../../tests/e2e/scenarios/sc-005-taxi-driver-full-trip.spec.ts) | [Report](../../playwright-report-sc-005.json) |
| **SC-006** | Taxi Driver Multi-Slot Workflow (orderId + payment) | `ACCEPTED` | [JSON](../../scenario-sc-006-taxi-driver-multi-slot.json) | [Contract](../../tests/contract/scenarios/sc-006-taxi-driver-multi-slot.spec.ts) | [E2E](../../tests/e2e/scenarios/sc-006-taxi-driver-multi-slot.spec.ts) | [Report](../../playwright-report-sc-006.json) |
| **SC-007** | Taxi Driver Context Isolation & Cross-Protection | `ACCEPTED` | [JSON](../../scenario-sc-007-taxi-driver-context-isolation.json) | [Contract](../../tests/contract/scenarios/sc-007-taxi-driver-context-isolation.spec.ts) | [E2E](../../tests/e2e/scenarios/sc-007-taxi-driver-context-isolation.spec.ts) | [Report](../../playwright-report-sc-007.json) |

---

### Архитектурные инварианты реестра:
1. **Единая схема спецификации:** Все сценарии соответствуют `ScenarioSet v2.0` без использования `targetState`.
2. **Изоляция каналов:** Все голосовые события подаются исключительно через `window.__VOICE_CHANNEL__.handleIncomingVoice(...)`.
3. **Строгая валидация:** Все тесты проверяют реальный `DialogueManager.getExecutionLogs()` и структурированный payload действий без UI-fallback и моков.
