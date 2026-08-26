# ТЗ-VOICE-PLATFORM-015: Action Dispatch Reliability & Outbound Port Contract

## 1. Статус Приёмки (Acceptance Status)
- **Статус:** **ACCEPTED**
- **Граница ответственности (Scope Boundary):**  
  Платформа полностью реализует надежное управление диалоговыми контекстами, детерминированное извлечение слотов, идемпотентное формирование исполнения (`executionId`, `idempotencyKey`), семантику ретраев, изоляцию состояния `UNKNOWN` с обязательной детерминированной процедурой `reconcileExecution()`, а также строгую валидацию ответов выходного порта `ActionDispatcher`.
- **Граница платформы:** Заканчивается строго на интерфейсе `ActionDispatcher` (Outbound Port в гексагональной архитектуре).

---

## 2. Ключевые Архитектурные Инварианты (Verified Invariants)
1. **Единая логическая сущность `executionId`:** Один логический Action порождает ровно один `executionId` и стабильный `idempotencyKey`, сохраняемые на протяжении всех попыток (`attempt: 1..N`). Защищено от перезаписи с отличающимися данными (`CONTRACT_VIOLATION`).
2. **Статусная модель:** `PENDING` $\to$ `DISPATCHING` $\to$ (`SUCCEEDED` | `FAILED` | `UNKNOWN`).
3. **Статус `UNKNOWN`:** При отсутствии подтверждения от внешней системы результат помечается как `UNKNOWN`. Контекст **НЕ** переходит в `COMPLETED`. Прямой повторный вызов `dispatchAction()` блокируется с `CONTRACT_VIOLATION` до вызова явного метода `reconcileExecution()`.
4. **Неизменность Payload:** Повторный вызов с тем же `executionId`, но изменённым payload, вызывает ошибку `CONTRACT_VIOLATION`.
5. **Retry Policy:** Повторные попытки осуществляются только для ошибок из списка `retryableErrors` (`TIMEOUT`, `NETWORK_ERROR`, `TEMPORARY_UNAVAILABLE`). Неретраябельные ошибки немедленно переводят статус в `FAILED` без повторов.
6. **Защита терминального статуса `FAILED`:** Повторный `dispatchAction()` для `FAILED` выполнения заблокирован.
7. **Валидация ответа Dispatcher:** Строгая проверка соответствия `result.executionId === execution.executionId` и `result.attempt === execution.attempt`.
8. **Синхронизация Context:** Во время активного диспетчера `ctx.status = 'DISPATCHING'`. Терминальный статус `COMPLETED` выставляется только при подтверждённом `SUCCEEDED`.

---

## 3. INTEGRATION-FSM-001 — External Order FSM Execution Boundary (GAP Statement)

- **Тикет:** `INTEGRATION-FSM-001`
- **Статус GAP:** **OPEN**
- **Описание:**
  1. Реальный распределённый серверный Order FSM / Database Persistence Layer отсутствует в данном репозитории (`voice-assistant` является клиентским Voice Platform SDK).
  2. Реализация `PlatformFsmExecutionBoundary` в `apps/voice-demo` является исключительно **Validation/Demo Adapter** для сквозных проверок контракта выходного порта, а не настоящим серверным FSM.
  3. Изменения в `DialogueStateManager` запрещены; создание новых локальных браузерных симуляций FSM не требуется.
- **Следующий шаг:**
  Интеграция выходного порта `ActionDispatcher` с реальным внешним Order FSM / Backend сервисом через согласованный транспортный протокол (HTTP/gRPC/WebSocket) в рамках отдельного интеграционного этапа.
