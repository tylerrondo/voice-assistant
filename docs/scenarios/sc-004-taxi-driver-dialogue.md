# Сценарий SC-004: Многошаговый диалог водителя такси (Slot-Filling)

## 1. Назначение сценария
Сценарий SC-004 реализует предметный бизнес-процесс принятия заказа водителем при подаче неполной голосовой команды («Прими заказ»), последующем дозапросе («Какой заказ?»), заполнении параметра `orderId` («Заказ 1001») и переводе рабочего FSM водителя в `ORDER_ACCEPTED`.

## 2. Архитектурная цепочка
```text
Водитель: «Прими заказ»
   ↓
VoiceChannel.handleIncomingVoice(phrase)
   ↓
Intent Resolver: ACCEPT_ORDER (slots: {})
   ↓
Missing Slot Detector: missingSlots: ["orderId"]
   ↓
DialogueStateManager: status = WAITING_FOR_SLOT, prompt = "Какой заказ?"
   ↓
Водитель: «Заказ 1001»
   ↓
Slot Resolution: orderId = 1001, status = COMPLETED
   ↓
Action Dispatch: driver.order.accepted { orderId: 1001 }
   ↓
Driver FSM: AVAILABLE → ORDER_ACCEPTED
