# Сценарий SC-007: Переключение контекста и изоляция заказов водителя

## 1. Цель
Доказать строгую изоляцию Dialogue State при переключении между заказами: частичное заполнение `orderId: 1001` с последующей подачей новой команды «Прими заказ 1002» гарантированно сбрасывает старый контекст и исключает контаминацию слотов и событий (`1001 + card` $\to$ 0 выполнений, `1002 + card` $\to$ строго 1 выполнение).

## 2. Архитектурная схема переключения контекста
```text
Водитель: «Прими заказ»
   ↓
Dialogue State A: WAITING_FOR_SLOT (missing: ["orderId", "payment"])
   ↓
Водитель: «1001»
   ↓
Dialogue State A: WAITING_FOR_SLOT (slots: { orderId: 1001 }, missing: ["payment"])
   ↓
Водитель: «Прими заказ 1002» (НОВЫЙ INTENT)
   ↓
Dialogue State A: DISCARDED / INACTIVE
Dialogue State B: WAITING_FOR_SLOT (slots: { orderId: 1002 }, missing: ["payment"])
   ↓
Водитель: «Картой»
   ↓
Dialogue State B: COMPLETED (slots: { orderId: 1002, payment: "card" })
   ↓
Event: driver.order.accepted { orderId: 1002, payment: "card" }
FSM: AVAILABLE → ORDER_ACCEPTED
