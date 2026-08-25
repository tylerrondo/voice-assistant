# ТЗ-VOICE-PLATFORM-014: Intent Resolution Policy, Slot Ambiguity & Scenario Registry Integrity

## 1. Назначение и Архитектурная Цель
Формализовать универсальные детерминированные политики разрешения неоднозначностей на уровнях:
1. **Scenario Registry Integrity:** Атомарная валидация сценариев при регистрации (запрет дубликатов `id`, коллизий `trigger`/`alias`, отсутствия обязательных полей).
2. **Intent Resolution:** Разрешение интента на основе декларативного `priority`. При одинаковом максимальном приоритете возвращается явный `AMBIGUOUS_INTENT`.
3. **Slot Ambiguity:** Предотвращение скрытого перезаписывания слотов при совпадении экстракторов. При равенстве приоритетов возвращается `AMBIGUOUS_SLOT`.
4. **Zero-Execution Invariant:** При `AMBIGUOUS_INTENT` и `AMBIGUOUS_SLOT` гарантируется 0 исполнений действий (`executions.length === 0`).

## 2. Иерархия разрешения
```text
Voice Input (phrase)
       │
       ▼
[ IntentResolver (Priority-based) ]
  ├── RESOLVED ─────────> Scenario Selected
  ├── AMBIGUOUS_INTENT ─> 0 Executions, Prompt clarification
  └── NO_MATCH ─────────> Zero Action
       │ (if RESOLVED)
       ▼
[ SlotExtractor (Priority-based) ]
  ├── RESOLVED ─────────> Slots Extracted
  ├── AMBIGUOUS_SLOT ───> 0 Executions, Retain Context State
  └── NO_MATCH
       │
       ▼
[ Context Router & Ownership Guard (PLATFORM-013) ]
       │
       ▼
[ Action Dispatch Boundary ]
