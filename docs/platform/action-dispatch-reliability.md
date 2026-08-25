# ТЗ-VOICE-PLATFORM-015: Action Dispatch Reliability & Retry Semantics

## 1. Назначение и Архитектурная Цель
Гарантировать корректное, надёжное и идемпотентное выполнение Action Dispatch при сбоях сети, тайм-аутах, повторной доставке и конкурентных вызовах.

## 2. Ключевые Инварианты
1. **Единая логическая сущность `executionId`:** Один логический Action порождает ровно один `executionId` и стабильный `idempotencyKey`, сохраняемые на протяжении всех попыток (`attempt: 1..N`).
2. **Статусная модель:** `PENDING` $\to$ `DISPATCHING` $\to$ (`SUCCEEDED` | `FAILED` | `UNKNOWN`).
3. **Статус `UNKNOWN`:** При отсутствии подтверждения от внешней системы результат помечается как `UNKNOWN`. Контекст **НЕ** переходит в `COMPLETED`, и новый `executionId` не создаётся.
4. **Неизменность Payload:** Повторный вызов с тем же `executionId`, но изменённым payload, вызывает ошибку `CONTRACT_VIOLATION`.
5. **Retry Policy:** Повторные попытки осуществляются только для ошибок из списка `retryableErrors` (`TIMEOUT`, `NETWORK_ERROR`, `TEMPORARY_UNAVAILABLE`). Неретраябельные ошибки (`INVALID_ACTION`, `CONTRACT_VIOLATION`) немедленно переводят статус в `FAILED` без повторов.
6. **Связь состояния Контекста:** Только при `SUCCEEDED` контекст переходит в терминальный статус `COMPLETED`.
