# Сценарий SC-005: Полный рабочий цикл водителя такси с Dialogue State

## 1. Цель
Сценарий SC-005 доказывает бесшовную работу голосовой платформы в полном жизненном цикле заказа:
`AVAILABLE` → `ORDER_ACCEPTED` (через Multi-Turn Dialogue State) → `DRIVER_ARRIVED` → `IN_TRIP` → `TRIP_FINISHED` → `AVAILABLE`.

## 2. Таблица переходов
| Голосовая команда | Intent | Event | FSM Transition | Slots / Payload |
|---|---|---|---|---|
| «Прими заказ» | ACCEPT_ORDER | - | (WAITING_FOR_SLOT) | `missingSlots: ["orderId"]` |
| «1001» | ACCEPT_ORDER | `driver.order.accepted` | AVAILABLE → ORDER_ACCEPTED | `{ orderId: 1001 }` |
| «Я приехал» | DRIVER_ARRIVED | `driver.arrived` | ORDER_ACCEPTED → DRIVER_ARRIVED | `{ orderId: 1001 }` |
| «Начать поездку» | START_TRIP | `driver.trip.started` | DRIVER_ARRIVED → IN_TRIP | `{ orderId: 1001 }` |
| «Завершить поездку» | FINISH_TRIP | `driver.trip.finished` | IN_TRIP → TRIP_FINISHED | `{ orderId: 1001, payment: "cash" }` |
| «Готов к следующему заказу» | DRIVER_AVAILABLE | `driver.available` | TRIP_FINISHED → AVAILABLE | `{ status: "available" }` |

## 3. Требования к Dialogue State
После завершения шага `ACCEPT_ORDER` (`COMPLETED`) состояние диалога не блокирует последующие независимые интенты (`DRIVER_ARRIVED`, `START_TRIP`, `FINISH_TRIP`, `DRIVER_AVAILABLE`).
