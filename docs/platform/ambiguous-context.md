# ТЗ-VOICE-PLATFORM-011: Ambiguous Voice Input / Context Selection Policy

## 1. Цель
Формализовать и доказать архитектурную политику маршрутизации неадресованной голосовой реплики при наличии нескольких параллельных `Dialogue Contexts` в состоянии `WAITING_FOR_SLOT`.

## 2. Модель маршрутизации (Routing States)
1. **`RESOLVED` (`{ status: "RESOLVED", contextId: string }`):**
   - Найдено точное совпадение по явной entity (например, «Заказ 1002, картой»), ЛИБО
   - Ровно один активный контекст ожидает извлечённый слот (`candidates.length === 1`).
2. **`AMBIGUOUS_CONTEXT` (`{ status: "AMBIGUOUS_CONTEXT", candidateContextIds: string[], clarificationPrompt: string }`):**
   - Несколько активных контекстов ожидают одинаковый слот (`candidates.length > 1`) и реплика не содержит идентифицирующей entity.
   - **Инвариант:** Строго 0 доменных выполнений (`executions === 0`). `activeContextId` НЕ используется как скрытый fallback.
   - Возвращается декларативный `clarificationPrompt` на основе шаблона `ScenarioDefinition.ambiguityPrompt`.
3. **`NO_MATCH` (`{ status: "NO_MATCH" }`):**
   - Ни один активный контекст не ожидает данный слот (`candidates.length === 0`). Действие не выполняется.

## 3. Исключение неактивных контекстов
Контексты со статусами `COMPLETED`, `CANCELLED` или `EXPIRED` автоматически исключаются из множества `candidates`.
