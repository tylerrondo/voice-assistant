# Slot-Filling / Dialogue State Research (ТЗ-VOICE-PLATFORM-004)

## 1. Executive Summary
Настоящее исследование проведено в рамках ТЗ-VOICE-PLATFORM-004 для определения фактических возможностей текущей голосовой платформы по поддержке многошагового диалога (Multi-Turn Dialogue), выявления отсутствующих обязательных параметров (Missing Slot Detection) и сохранения контекста диалога (Dialogue State Persistence).

**Главный вывод:** 
Текущая платформа спроектирована как **Single-Turn Intent Trigger & Scenario Execution Engine**. В архитектуре отсутствуют компоненты Dialogue State Manager, Missing Slot Detector и механизм обратного связывания последующей реплики с незавершённым Intent (Slot-Filling).

**Рекомендация:** **Вариант B.** Для реализации сценариев типа SC-004 (с неполными командами) требуется предварительное платформенное ТЗ на реализацию Dialogue State / Slot-Filling слоя.

---

## 2. Existing Architecture
Фактический контур обработки голосовой команды в репозитории:
```text
Voice Input (ASR / Text)
        ↓
Voice Channel / Emulator
        ↓
Intent Resolver (Pattern/Alias Matcher)
        ↓
Scenario Registry (Lookup by action.type / trigger)
        ↓
Scenario Engine (Execution of ScenarioSteps: emit, delay, end)
        ↓
Driver / Seller FSM Event & UI Update
