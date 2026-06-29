# Handover Guide

## Назначение
Этот документ предназначен для нового разработчика или AI-ассистента,
который впервые получает этот репозиторий.

## С чего начать

### 1. Прочитать сначала
- README.md — общее описание проекта
- docs/ARCHITECTURE.md — архитектура платформы
- docs/PLATFORM_VISION.md — зачем существует платформа
- docs/PLATFORM_RULES.md — что можно и нельзя менять

### 2. Понять структуру
- docs/REPOSITORY_MAP.md — где что находится
- docs/ROADMAP.md — текущее состояние и следующие задачи

### 3. Изучить историю
- docs/history/README.md — история всех PR
- docs/rfc/ — оригинальные постановки задач

### 4. Понять как мигрировать новый канал
- docs/MIGRATING_NEW_CHANNEL.md — пошаговая инструкция

## Текущая задача
Следующий этап — миграция существующего Map-модуля на Platform Core.
Подробнее: docs/ROADMAP.md (Phase 5)

## Структура пакетов
- packages/interaction-contract/ — ядро платформы
- packages/voice/ — голосовой канал
- packages/emulator/ — автономное тестирование
- packages/scenario-engine/ — декларативные сценарии
- packages/execution-log/ — журнал выполнения
- packages/verification/ — проверка сценариев
- apps/voice-demo/ — Validation Bench

## Как запустить
1. npm install
2. cd apps/voice-demo
3. npm run dev
4. Открыть браузер

## Validation Bench (Vercel)
https://voice-assistant-two-olive.vercel.app

## GitHub
https://github.com/tylerrondo/voice-assistant