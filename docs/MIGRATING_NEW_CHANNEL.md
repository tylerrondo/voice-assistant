# Migrating a New Channel

## Главный принцип
Новый канал никогда не изменяет платформу. Он строится поверх существующих компонентов.

## Что уже существует
Interaction Contract, Emulator, Scenario Engine, Execution Log, Verification Harness, Validation Bench.
Создавать их повторно запрещается.

## Что необходимо реализовать
1. Provider - получает данные от внешнего API
2. Mapper - преобразует данные в InteractionAction
3. Channel - соединяет Provider и InteractionContract
4. Demo Integration - подключение к существующему Validation Bench

## Этапы миграции
1. Создать Provider
2. Создать Mapper
3. Создать Channel, подключить к Emulator
4. Создать сценарии, запустить через Scenario Engine
5. Проверить Execution Log
6. Запустить Verification Harness
7. Подключить Validation Bench
8. Развернуть на Vercel
9. Проверить Backend API (POST /api/v1/auth/, POST /api/v1/mail/)
10. Интегрировать в приложение

## Что запрещено
Менять: InteractionContract, Emulator, ScenarioEngine, Verification, ExecutionLog, Voice Channel.
