# Сценарий SC-008: Отмена и восстановление многошагового диалога водителя (Dialogue Lifecycle)

## 1. Цель
Доказать полный жизненный цикл многошагового Dialogue State для `ACCEPT_ORDER`:
1. **Восстановление (Recovery):** Ошибочные ответы («Не знаю», «Сам») сохраняют уже заполненные слоты (`orderId: 1001`) и позволяют успешно завершить диалог без создания паразитных выполнений.
2. **Отмена (Cancellation):** Команда «Отмена» переводит состояние в `CANCELLED`, обнуляет выполнение события `driver.order.accepted`, и гарантирует, что последующие реплики («Картой») не воскресят отменённый контекст.
3. **Изоляция нового заказа (Cross-Lifecycle):** Создание нового заказа (`1002`) после отмены `1001` приводит к выполнению только `1002 + payment` со строгим `executionCount === 1`.

## 2. Схема жизненного цикла диалога
```text
[AVAILABLE]
    │
    ▼ «Прими заказ»
[WAITING_FOR_SLOT] (missing: orderId, payment)
    │
    ├── «Не знаю» ───────────────► [WAITING_FOR_SLOT] (контекст сохранён)
    │                                    │
    ├── «1001» ──────────────────────────┼───────────────► [WAITING_FOR_SLOT] (orderId: 1001, missing: payment)
    │                                    │                      │
    ├── «Отмена» ──────────────┐         │                      ├── «Отмена» ──────────────┐
    │                          │         │                      │                          │
    ▼                          ▼         │                      ▼                          ▼
[CANCELLED]               [CANCELLED]    │                 [CANCELLED]                [CANCELLED]
(0 execution)             (0 execution)  │                 (0 execution)              (0 execution)
                                         │                      │
                                         ▼ «1001»               ▼ «Картой»
                                   [WAITING_FOR_SLOT]     [COMPLETED]
                                   (orderId: 1001)        Event: driver.order.accepted { orderId: 1001, payment: "card" }
                                         │                FSM: ORDER_ACCEPTED
                                         ▼ «Картой»
                                   [COMPLETED]
