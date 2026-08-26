# ТЗ-VOICE-PLATFORM-016: Concurrency Control for Context State Mutation

## 1. Статус и Основание
- **Статус:** **CLOSED / IMPLEMENTED**
- **GAP-F из VOICE-PLATFORM-CAPABILITY-AUDIT-001:** **CLOSED**

---

## 2. Архитектурная модель сериализации (Per-Context Serialization Queue & CAS)

Вместо глобального mutex, блокирующего всю платформу, реализована **Per-Context Serialization Promise Chain** в сочетании с оптимистическим версионированием **CAS (`version: number`)**:

1. **Изоляция независимых контекстов:**  
   Каждый `contextId` имеет свою независимую цепочку `contextMutationQueues.get(contextId)`. Мутации в `Context A` и `Context B` выполняются параллельно без взаимных блокировок.
2. **Атомарная инкрементация версий:**  
   Любое изменение состояния (`fillSlot`, `cancelContext`, `expireContext`, `handleSystemEvent`, `dispatchAction`, `reconcileExecution`) выполняется через атомарную функцию `executeSerializedMutation`. При каждом успешном изменении `version` увеличивается на 1.
3. **Контроль конфликта версий (`CONTEXT_VERSION_CONFLICT`):**  
   Если передан `expectedVersion` и он не совпадает с текущим `version`, операция детерминированно отклоняется со статусом `CONTEXT_VERSION_CONFLICT` (Lost updates исключены).
4. **Защита терминальных состояний (`TERMINAL_STATE`):**  
   После перехода контекста в `COMPLETED`, `CANCELLED` или `EXPIRED`, любые последующие мутации отклоняются ошибкой `TERMINAL_STATE`.
5. **Разрешение гонок (Voice x System Events x TTL):**  
   Все конкурирующие события попадают в FIFO-очередь своего контекста. Первое терминальное событие переводит контекст в терминальный статус, а все последующие конкурирующие события детерминированно отбрасываются без повторного side-effect.
