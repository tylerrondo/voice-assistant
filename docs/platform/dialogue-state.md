# Platform Dialogue State & Slot-Filling Engine (ТЗ-VOICE-PLATFORM-005)

## 1. Архитектурная модель
Модель Dialogue State внедряется на уровне Voice Interaction между Intent Resolver и Scenario Execution.

```text
Voice Input («Обработай яблоки»)
        ↓
Intent Resolver (Intent: PROCESS_TEST_ACTION, item: apples)
        ↓
Dialogue State Engine
   ├── Все обязательные slots (item, quantity) заполнены?
   │      ├── YES → Execute Action
   │      └── NO  → Создать DialogueState (WAITING_FOR_SLOT: quantity)
   │                  ↓
   │             Clarification Prompt («Сколько?»)
   │                  ↓
   │             Next Voice Input («Пять»)
   │                  ↓
   │             Slot Resolver (quantity = 5)
   │                  ↓
   │             Все slots заполнены → DialogueState: COMPLETED
   │                  ↓
   │             Emit Action (PROCESS_TEST_ACTION: item=apples, quantity=5)
