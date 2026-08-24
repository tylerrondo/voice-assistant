import { DialogueStateManager } from './dialogue-manager';

export class VoiceChannel {
  private dialogueManager: DialogueStateManager;

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public async handleIncomingVoice(phrase: string): Promise<any> {
    const text = phrase.trim().toLowerCase();

    // 1. Explicit cancellation for active context
    if (text.includes('отмена')) {
      return this.dialogueManager.cancelContext();
    }

    // 2. Global / Independent Intent (e.g. Arrived)
    if (text.includes('я приехал') || text.includes('прибыл')) {
      return this.dialogueManager.createContext('DRIVER_ARRIVED', {}, [], 'driver.arrived');
    }

    // 3. New Intent creation: "Прими заказ [id] [payment]"
    if (text.startsWith('прими заказ') || text.startsWith('заказ')) {
      const slots: Record<string, any> = {};
      const numMatch = text.match(/\b\d+\b/);
      if (numMatch) {
        slots.orderId = parseInt(numMatch[0], 10);
      }
      if (text.includes('наличными') || text.includes('наличка')) {
        slots.payment = 'cash';
      } else if (text.includes('картой') || text.includes('карта') || text.includes('безнал')) {
        slots.payment = 'card';
      }

      return this.dialogueManager.createContext('ACCEPT_ORDER', slots, ['orderId', 'payment'], 'driver.order.accepted');
    }

    // 4. Production Context Router integration
    const targetCtx = this.dialogueManager.routeUtterance(text);
    if (!targetCtx || targetCtx.status !== 'WAITING_FOR_SLOT') {
      return null;
    }

    // Extract slots dynamically
    const numMatch = text.match(/\b\d+\b/);
    if (numMatch && targetCtx.missingSlots.includes('orderId')) {
      return this.dialogueManager.fillSlot('orderId', parseInt(numMatch[0], 10), targetCtx.contextId);
    }

    if ((text.includes('наличными') || text.includes('наличка')) && targetCtx.missingSlots.includes('payment')) {
      return this.dialogueManager.fillSlot('payment', 'cash', targetCtx.contextId);
    }

    if ((text.includes('картой') || text.includes('карта') || text.includes('безнал')) && targetCtx.missingSlots.includes('payment')) {
      return this.dialogueManager.fillSlot('payment', 'card', targetCtx.contextId);
    }

    // Invalid phrase: preserves context state
    return targetCtx;
  }
}
