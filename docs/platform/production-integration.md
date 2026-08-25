# ТЗ-VOICE-PLATFORM-012: Production Voice Pipeline Integration (GAP-000 Closed)

## 1. Архитектурная декларация
В репозитории полностью устранён раскол (GAP-000) между модулями `src/platform/*` и приложением `apps/voice-demo`.

## 2. Единый Runtime Execution Graph
```text
Пользователь / Микрофон / Voice Text
                 │
                 ▼
     apps/voice-demo/src/App.ts
                 │
                 ▼
     apps/voice-demo/src/Bootstrap.ts (createProductionRuntime)
                 │
                 ▼
     src/platform/voice-channel.ts (handleIncomingVoice)
                 │   ├── Intent Resolution (ScenarioRegistry)
                 │   ├── Context Scoped Slot Extraction
                 │   └── Ambiguity Policy Guard (resolveRouting)
                 ▼
     src/platform/dialogue-manager.ts
                 │   ├── Context Lifecycle (TTL Auto-Expiry Scheduler)
                 │   ├── Multi-Context Isolation Pool
                 │   └── Record Execution
                 ▼
      Action Dispatch Boundary (onActionDispatch)
                 │
                 ▼
        FSM / Emulator Dispatcher
                 ├── driver.order.accepted ───> State: ORDER_ACCEPTED
                 ├── driver.arrived        ───> State: ARRIVED
                 ├── driver.trip.started   ───> State: IN_TRIP
                 └── driver.trip.finished  ───> State: COMPLETED
