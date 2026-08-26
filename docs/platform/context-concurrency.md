# ТЗ-VOICE-PLATFORM-016: Concurrency Control for Context State Mutation

## 1. Статус и Основание
- **Статус:** **CLOSED / IMPLEMENTED**
- **GAP-F из VOICE-PLATFORM-CAPABILITY-AUDIT-001:** **CLOSED**

---

## 2. Архитектурная модель сериализации (Per-Context Serialization Queue & Full Dispatch Locking)

Реализована модель **Option B — Full Per-Context Execution & Mutation Queueing** в сочетании с оптимистическим версионированием **CAS (`version: number`)**:

1. **Изоляция независимых контекстов:**  
   Каждый `contextId` имеет изолированную Promise-цепочку `contextMutationQueues.get(contextId)`. Мутации в `Context A` и `Context B` выполняются параллельно без взаимных блокировок.
2. **Включение Action Dispatch в очередь (Full Lifecycle Lock):**  
   Вызов `dispatchAction()` захватывает очередь контекста на всё время выполнения (включая асинхронный вызов `actionDispatcher`). Любые параллельно поступающие события (`Cancel`, `TTL`, `SystemEvent`) встают в очередь и обрабатываются строго после завершения текущего Dispatch.
3. **Детерминированные правила разрешения гонок (Race Winners):**
   - **Order Dispatch $\to$ Cancel:** Dispatch завершается `SUCCEEDED` $\to$ контекст переходит в `COMPLETED`. Следующий в очереди `Cancel` видит терминальный статус `COMPLETED` и отклоняется с ошибкой `TERMINAL_STATE`.
   - **Order Cancel $\to$ Dispatch:** `Cancel` переводит контекст в `CANCELLED`. Следующий в очереди `Dispatch` немедленно отклоняется `CONTRACT_VIOLATION: Context is already in terminal status "CANCELLED"` без произведения внешнего side effect.
   - **TTL $\to$ Action / Action $\to$ TTL:** Аналогично разрешается по порядку попадания в очередь без возникновения промежуточных состояний.
4. **Декларативные системные события:**  
   `handleSystemEvent(contextId, eventDescriptor, identity)` принимает декларативное описание `{ type, targetTransition: 'COMPLETE' | 'CANCEL' | 'NONE' }`. Неизвестные события (`NONE`) не вызывают мутаций и возвращают `SYSTEM_EVENT_NOT_HANDLED`.
5. **Очистка очередей (GC Lifecycle):**  
   После завершения последнего Promise в очереди контекста запись из `contextMutationQueues` автоматически удаляется.
