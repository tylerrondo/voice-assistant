# Сценарий SC-006: Многошаговая голосовая операция с несколькими обязательными слотами

## 1. Цель
Доказать способность платформы Dialogue State обрабатывать несколько обязательных слотов (`orderId` и `payment`) в рамках одного Intent `ACCEPT_ORDER`, сохранять частично заполненный контекст между репликами и производить строго одно атомарное выполнение события `driver.order.accepted`.

## 2. Спецификация слотов
| Слот | Тип | Обязательность | Clarification Prompt | Пример значений |
|---|---|---|---|---|
| `orderId` | `number` | Да | «Какой заказ?» | `1001`, `2002` |
| `payment` | `string` | Да | «Какой способ оплаты?» | `cash` («наличными»), `card` («картой») |

## 3. Схема последовательного Multi-Turn диалога
```text
Водитель: «Прими заказ»
   ↓
Dialogue State: WAITING_FOR_SLOT
missingSlots: ["orderId", "payment"]
Prompt: «Какой заказ?»
   ↓
Водитель: «1001»
   ↓
Dialogue State: WAITING_FOR_SLOT
slots: { orderId: 1001 }
missingSlots: ["payment"]
Prompt: «Какой способ оплаты?»
   ↓
Водитель: «Наличными»
   ↓
Dialogue State: COMPLETED
slots: { orderId: 1001, payment: "cash" }
   ↓
Event: driver.order.accepted { orderId: 1001, payment: "cash" }
FSM: AVAILABLE → ORDER_ACCEPTED
