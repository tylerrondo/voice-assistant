# ТЗ-VOICE-PLATFORM-012: Production Voice Pipeline Integration

## 1. Назначение и Цель
Формализовать и доказать интеграцию единого платформенного слоя `src/platform/*` (`VoiceChannel` + `DialogueStateManager`) в сквозной production runtime graph приложения `apps/voice-demo` без параллельных/фиктивных реализаций.

## 2. Сквозной граф исполнения (Runtime Execution Graph)
```text
Voice Input (Microphone / Utterance text)
     │
     ▼
[ apps/voice-demo ] (window.__VOICE_CHANNEL__)
     │
     ▼
src/platform/voice-channel.ts (handleIncomingVoice)
     │  ├── Intent Resolution (ScenarioRegistry)
     │  ├── Scoped Slot Extraction (slotExtractors)
     │  └── Ambiguity Policy Guard (resolveRouting)
     ▼
src/platform/dialogue-manager.ts
     │  ├── Context Pool Management (TTL Auto-Expiry Scheduler)
     │  ├── Slot Filling & Status Transition
     │  └── Record Execution
     ▼
[ Action Dispatch Boundary ] (onActionDispatch Callback)
     │
     ▼
[ FSM / Emulator State Machine ]
     ├── driver.order.accepted ───> State: ORDER_ACCEPTED
     ├── driver.arrived        ───> State: ARRIVED
     ├── driver.trip.started   ───> State: IN_TRIP
     └── driver.trip.finished  ───> State: COMPLETED
