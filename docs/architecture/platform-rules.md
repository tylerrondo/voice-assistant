# Platform Rules

> Версия: 1.0  
> Статус: Stable

---

## Rule 1. Platform First
Перед созданием нового компонента разработчик обязан проверить, можно ли использовать уже существующий компонент платформы.

## Rule 2. Reuse Before Build
Повторное использование всегда предпочтительнее создания нового кода.

## Rule 3. No Duplicate Infrastructure
Запрещается создавать альтернативные реализации: Interaction Contract, Scenario Engine, Execution Log, Verification Harness, Validation Bench, Emulator.

## Rule 4. Channels Are Replaceable
Любой канал должен быть полностью заменяемым. Удаление одного канала не должно влиять на другие.

## Rule 5. Providers Never Contain Business Logic
Provider отвечает исключительно за взаимодействие с внешней системой.

## Rule 6. Channels Never Make Decisions
Channel является транспортным слоем. Логика принятия решений находится вне Channel.

## Rule 7. Mappers Only Transform Data
Mapper выполняет только преобразование моделей данных.

## Rule 8. Scenario Driven Validation
Любая новая функциональность должна быть проверена через Scenario Engine, Execution Log, Verification Harness.

## Rule 9. Validation Before Integration
До интеграции новый канал обязан пройти: Emulator → Scenario Engine → Execution Log → Verification Harness → Validation Bench.

## Rule 10. Observability Is Mandatory
Все значимые действия должны быть наблюдаемыми через Execution Log.

## Rule 11. Reports Must Be Reproducible
Отчет обязан содержать: тестера, версию сборки, сценарии, Execution Log, результаты Verification, окружение.

## Rule 12. Backend Services Must Be Reused
Validation Bench использует существующие API. Создание собственных сервисов запрещается.

## Rule 13. Platform Evolution
Platform Core развивается только при подтверждении необходимости несколькими независимыми подсистемами.

## Rule 14. Backward Compatibility
Изменения Platform Core не должны нарушать существующие каналы.

## Rule 15. Documentation Is Part of the Platform
Изменение архитектуры незавершено без обновления кода, документации, истории PR и Validation Bench.