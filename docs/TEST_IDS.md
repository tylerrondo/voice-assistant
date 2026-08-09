# Validation Bench — Test IDs

Это контракт тестовой панели: список всех публичных `data-testid`
Validation Bench. Playwright-тесты обращаются к элементам панели
только через `page.getByTestId(...)` (см. docs/rfc/PR-12.md). Если вы
переименовываете или удаляете `data-testid` из этой таблицы — это
breaking change для тест-сьюта, и таблицу нужно обновить в том же PR.

## Правила

- `data-testid` являются частью публичного контракта Validation Bench.
- Изменение или удаление существующего `data-testid` допускается
  только через breaking change.
- Для новых интерактивных элементов `data-testid` обязателен.
- Новые Playwright-тесты должны использовать `getByTestId()` как
  основной способ поиска.

## Session Panel
| data-testid | Элемент |
|---|---|
| `session-tester` | Имя тестировщика |
| `session-ui-language` | Язык интерфейса |
| `session-voice-language` | Язык голоса (STT/TTS/промпты) |
| `session-recognition-provider` | Провайдер распознавания |
| `session-speech-provider` | Провайдер синтеза речи |
| `session-scenario-set` | Метка набора сценариев (см. ScenarioSource ниже — это разные вещи) |
| `session-build` | Версия сборки |
| `session-commit` | Commit hash |
| `session-env` | Окружение |
| `session-backend-url` | URL бэкенда |
| `session-login` | Логин |
| `session-password` | Пароль |

## Validation Mode / Input Source
| data-testid | Элемент |
|---|---|
| `validation-mode` | Селект Automatic / Interactive |
| `input-source` | Селект Browser mic / Inject (только в Interactive) |
| `input-source-row` | Контейнер строки Input Source (видимость) |

## Scenario Source (PR-11)
| data-testid | Элемент |
|---|---|
| `scenario-source-builtin` | Radio "Built-in" |
| `scenario-source-file` | Radio "JSON File" |
| `scenario-file-input` | `<input type="file">` |
| `scenario-choose-file-button` | Кнопка "Choose File..." |
| `scenario-file-name` | Имя активного файла сценариев |
| `scenario-error` | Блок сообщения об ошибке валидации |

## Automatic
| data-testid | Элемент |
|---|---|
| `run-all-button` | Кнопка "Run All" |
| `connect-button` | Кнопка "Connect" |
| `start-button` | Кнопка "Start" |
| `stop-button` | Кнопка "Stop" |
| `inject-action` | Селект "Inject action" |
| `inject-send-button` | Кнопка "Send" (inject) |
| `inject-controls` | Контейнер блока inject (видимость) |
| `mic-controls` | Контейнер блока микрофона (видимость) |
| `mic-status` | Статус микрофона |
| `automatic-channel-state` | Channel State |
| `automatic-progress` | Progress (Automatic) |
| `connection-status` | Статус подключения к backend |

## Interactive Runner
| data-testid | Элемент |
|---|---|
| `interactive-runner` | Панель Interactive Runner (видимость) |
| `session-state` | Состояние сессии |
| `current-step` | Текущий шаг ("N / M") |
| `progress-value` | Прогресс (%) |
| `recognized-text` | Распознанный текст |
| `speech-text` | Текст TTS |
| `interactive-next-button` | "Next Step" |
| `interactive-repeat-button` | "Repeat Step" |
| `interactive-skip-button` | "Skip Step" |
| `interactive-stop-button` | "Pause" (останавливает прогресс — ближайший аналог "stop" в ТЗ) |
| `interactive-resume-button` | "Resume" (доп. элемент, не было в ТЗ PR-12) |
| `interactive-reset-button` | "↻ Start New Session" |
| `interactive-summary` | Блок итогов сессии |

## Manual Validation
| data-testid | Элемент |
|---|---|
| `manual-recognized-yes-button` | "Recognized correctly? → Correct" |
| `manual-recognized-no-button` | "Recognized correctly? → Incorrect" |
| `manual-heard-yes-button` | "Expected speech heard? → Heard" |
| `manual-heard-no-button` | "Expected speech heard? → Not heard" |
| `manual-comment` | Поле комментария тестировщика |
| `manual-save-comment-button` | "Save comment" |

## Verification / Logs / Reports
| data-testid | Элемент |
|---|---|
| `verification-panel` | Блок Verification (PASS/FAIL) |
| `execution-log` | Execution Log |
| `last-report` | Report Preview (совпадает с "Last Report" из ТЗ — в реализации это один и тот же блок) |
| `json-report` | JSON Report |
| `report-history` | Report History |
| `download-json-button` | "Download JSON" |
| `send-report-button` | "Send Report" |

## Legacy (вне контракта)
| data-testid | Элемент |
|---|---|
| `legacy-upload-input` | Старая, не связанная со сценариями кнопка "Upload" (report-compare заготовка, вне scope PR-11/PR-12) |
| `legacy-upload-button` | То же |

## Документированные исключения (без data-testid)
- `#app` — корневой div монтирования приложения (index.html), инфраструктурный элемент, не часть Validation Bench.
- `getByTestId("verification-panel").getByText(/PASS|FAIL/)` — используется не для поиска элемента (у панели уже есть testid), а для ожидания конкретного значения результата внутри неё; отдельного testid на "индикатор PASS" и "индикатор FAIL" нет.
