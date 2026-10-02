test('GENERIC-09: Архитектурная верификация — в VoiceChannel отсутствуют любые доменные slot names', () => {
    const vcPath = path.resolve(__dirname, '../../../src/platform/voice-channel.ts');
    const vcContent = fs.readFileSync(vcPath, 'utf8');

    // Проверяем полное отсутствие доменных имен слотов и их скрытых fallback'ов в VoiceChannel
    const forbiddenSlots = [
      'targetOfferIndex',
      'targetVehicleType',
      'ambiguousSelectionCriteria',
      'selectedItemId',
      'selectedServiceId',
      'selectedOfferId',
      'orderId',
      'selectedOrderId'
    ];

    for (const forbidden of forbiddenSlots) {
      expect(vcContent).not.toContain(`'${forbidden}'`);
      expect(vcContent).not.toContain(`"${forbidden}"`);
    }
  });
