# Validation Bench — Deployment & Remote Testing Guide

Данный документ описывает процесс развертывания (deployment) Validation Bench на платформе Vercel и организации удаленного тестирования.

## 🚀 Развертывание на Vercel (Deployment)

Фронтенд-часть проекта (сборка с помощью Vite) публикуется на Vercel со следующими настройками:

1. **Build Command:** `npx vite build` (или `npm run build`)
2. **Output Directory:** `apps/voice-demo/dist` (или общая папка `dist` в зависимости от конфигурации)
3. **Framework Preset:** `Vite`

### 🌐 Переменные окружения (Environment Variables)
В панели управления Vercel (Dashboard) необходимо настроить:
* `VITE_BACKEND_URL`: URL-адрес Backend API для транспорта и аутентификации (например: `https://ibronevik.ru`).

---

## 🔒 HTTPS и ограничения браузеров (Browser Restrictions)

* **Безопасность (Mixed Content):** Vercel автоматически обеспечивает HTTPS для проектов. Если Backend API работает по HTTP, современные браузеры заблокируют запросы (`Mixed Content Error`). Поэтому Backend API в обязательном порядке должен поддерживать **HTTPS**.
* **Разрешения на микрофон и аудио:** Для работы функций распознавания речи (Speech Recognition) в браузере пользователь должен при входе на страницу предоставить разрешение (Allow) на использование микрофона.

---

## 👥 Удаленное тестирование (Remote Testing)

После публикации удаленные тестировщики (QA Engineers) могут использовать систему без локальной установки:
1. Переходят по предоставленной Vercel ссылке (URL).
2. Авторизуются через **Session Panel**, используя логин/пароль для подключения к Backend.
3. Нажимают кнопку **"Run All"** для запуска автоматических и интерактивных сценариев.
4. Проверяют результаты через **Report Preview**, скачивают JSON или отправляют отчет напрямую на Backend API с помощью **Send Report**.