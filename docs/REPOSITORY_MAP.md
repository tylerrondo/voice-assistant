# Repository Map

## Назначение
Навигатор по репозиторию для новых разработчиков.

## Структура
- docs/ - документация проекта
- packages/ - платформенные компоненты
- apps/ - прикладные приложения

## Пакеты
- interaction-contract/ - ядро платформы
- voice/ - голосовой канал
- emulator/ - автономное тестирование
- scenario-engine/ - декларативные сценарии
- execution-log/ - журнал выполнения
- verification/ - проверка сценариев

## Направление зависимостей
Apps -> Verification -> Execution Log -> Scenario Engine -> Emulator -> Voice -> Interaction Contract

## Platform Core
interaction-contract, scenario-engine, execution-log, verification
