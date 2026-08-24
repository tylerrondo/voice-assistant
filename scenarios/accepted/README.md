# Канонический Реестр Принятых Сценариев (Accepted Scenarios Registry)

В данном реестре зафиксированы все официально принятые сценарии голосового ассистента, прошедшие аудит спецификации, контрактные тесты и строгие Runtime E2E тесты с машинным отчётом Playwright.

| Сценарий | Название | Статус | Спецификация | Тесты E2E | Отчёт Playwright |
|---|---|---|---|---|---|
| **SC-001** | Simple Single Voice Command | `ACCEPTED` | [JSON](../../scenario-sc-001-simple-command.json) | [E2E](../../tests/e2e/scenarios/sc-001-simple-command.spec.ts) | [Report](../../playwright-report-sc-001.json) |
| **SC-002** | Voice Command with Single Parameter | `ACCEPTED` | [JSON](../../scenario-sc-002-single-param.json) | [E2E](../../tests/e2e/scenarios/sc-002-single-param.spec.ts) | [Report](../../playwright-report-sc-002.json) |
| **SC-003** | Clarification Dialogue Slot Filling | `ACCEPTED` | [JSON](../../scenario-sc-003-clarification-slot.json) | [E2E](../../tests/e2e/scenarios/sc-003-clarification-slot.spec.ts) | [Report](../../playwright-report-sc-003.json) |
| **SC-004** | Confirmation & Cancellation Dialogue | `ACCEPTED` | [JSON](../../scenario-sc-004-confirmation-cancel.json) | [E2E](../../tests/e2e/scenarios/sc-004-confirmation-cancel.spec.ts) | [Report](../../playwright-report-sc-004.json) |
| **SC-005** | Taxi Driver Full Trip Multi-Step Workflow | `ACCEPTED` | [JSON](../../scenario-sc-005-taxi-driver-full-trip.json) | [E2E](../../tests/e2e/scenarios/sc-005-taxi-driver-full-trip.spec.ts) | [Report](../../playwright-report-sc-005.json) |
| **SC-006** | Taxi Driver Multi-Slot Workflow | `ACCEPTED` | [JSON](../../scenario-sc-006-taxi-driver-multi-slot.json) | [E2E](../../tests/e2e/scenarios/sc-006-taxi-driver-multi-slot.spec.ts) | [Report](../../playwright-report-sc-006.json) |
| **SC-007** | Taxi Driver Context Isolation & Cross-Protection | `ACCEPTED` | [JSON](../../scenario-sc-007-taxi-driver-context-isolation.json) | [E2E](../../tests/e2e/scenarios/sc-007-taxi-driver-context-isolation.spec.ts) | [Report](../../playwright-report-sc-007.json) |
