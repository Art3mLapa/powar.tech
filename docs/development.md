# BSCP: разработка и запуск

## Аккаунты

BSCP использует только `username` и пароль. Почта и отдельное имя для регистрации не нужны и не хранятся в текущей схеме аккаунта. Username содержит 3–32 ASCII-символа: начинается с буквы или цифры, затем разрешены буквы, цифры, `_` и `-`. Значение обрезается по краям и приводится к нижнему регистру. `Admin` и `admin` — один логин. Обязательная 2FA и одноразовые приглашения сохраняются.

## Обновление существующей установки

Перед миграцией сделайте backup БД и storage. Новые установки используют Compose project и базу `bscp`. Переименование продукта не переименовывает существующие базы, каталоги, домены или Docker-тома.

Если используете прежние данные, задайте в окружении `POSTGRES_USER` и `POSTGRES_DB` с **прежними** значениями, а `POSTGRES_VOLUME_NAME` и `ASSET_STORAGE_VOLUME_NAME` — точными именами прежних томов (`docker volume ls`). Пароль БД и `TOTP_ENCRYPTION_KEY` должны остаться прежними. Не подключайте к одному PostgreSQL-тому два запущенных сервера одновременно. Для внешней БД используйте прежний `DATABASE_URL` при запуске приложений без Compose PostgreSQL.

Примените новые миграции через `bun --env-file=.env run db:migrate`. Они переводят аккаунты и приглашения на username, не меняя ID и связей статей/ролей/2FA. Уже заполненный валидный username сохраняется в нормализованном виде; отсутствующий, недопустимый или конфликтующий логин заменяется на `user_<id>` (при коллизии добавляется числовой суффикс). Использованное приглашение получает username связанного аккаунта; остальные получают `invite_<25 символов UUID>`. Неиспользованные старые приглашения следует проверить в админке и при необходимости выпустить заново под нужный username. Исторические записи аудита с однозначным соответствием также переводятся на username; неоднозначные исторические значения сохраняются.

После обновления потребуется повторно войти: cookie называется `bscp_session`. Существующий TOTP-секрет не меняется; старую запись в приложении-аутентификаторе можно переименовать в BSCP. Исторические миграции и их снимки сохранены неизменными для обновления старых баз.

## Структура

- `apps/frontend` — Next.js, страницы и представления, Axios-сервисы и query-слой.
- `apps/backend` — Elysia 2 RC API `/api/v1`, авторизация, статьи, доступы, просмотр патчей и управление задачами.
- `apps/worker` — очередь PostgreSQL, синхронизации и конвертация ресурсов в отдельных процессах.
- `packages/contracts` — общие Zod-схемы и DTO.
- `packages/database` — Prisma 8 contract, runtime и миграции.
- `packages/game-assets` — игровые бинарные форматы, диффы, изображения и CPU-рендер.
- `packages/design-tokens` — токены текущего оформления сайта.

Нужны Bun 1.4.3+, Node.js 24 (рекомендуется), PostgreSQL 18 и Chromium. Python не нужен для работы приложений. Рендер использует Three.js в Chromium со SwiftShader; GPU не требуется.

## Локальная разработка

1. `bun install --frozen-lockfile` из корня.
2. Создайте своё окружение по `.env.example`. Не добавляйте его в Git.
3. Сгенерируйте независимые значения `POSTGRES_PASSWORD` и `TOTP_ENCRYPTION_KEY` командой `openssl rand -hex 32`. Для подключения PostgreSQL пароль в `DATABASE_URL` должен совпадать с паролем базы. Использование hex-пароля исключает необходимость URL-кодировать специальные символы.
4. Dev Compose использует общий volume `/app/runtime/storage` для backend и worker и одну PostgreSQL БД.
5. Запустите полный локальный стек:

```sh
docker compose --env-file .env -f docker-compose.dev.yml up -d --build
```

`docker-compose.dev.yml` самодостаточен: включает PostgreSQL и все приложения. Он монтирует исходники frontend/backend/worker и workspace-пакетов, запускает Next.js и Bun в watch-режиме, применяет миграции отдельным сервисом и публикует PostgreSQL только на `127.0.0.1:55439` (настраивается `POSTGRES_PORT`). Backend доступен на `127.0.0.1:3001` (`BACKEND_PORT`), frontend — на `127.0.0.1:3000` (`FRONTEND_PORT`). Dev volumes изолированы от production Compose. Worker запущен для очереди и ручных jobs, но scheduler/автоматический patcher отключён.

После изменений схемы повторно примените миграции командой `docker compose --env-file .env -f docker-compose.dev.yml run --rm migrate`.

`WEB_ORIGIN` — точный origin frontend, без пути. Browser API-запросы проходят через Next.js rewrite и same-origin cookies. В dev `BACKEND_ORIGIN` задан как `http://backend:3001`; после его изменения перезапустите frontend. Не включайте `SCHEDULER_ENABLED=true`, пока не настроены источники и не проверены интервалы/нагрузка. Без расписания задачи доступны через `/admin/jobs`.

## Первый владелец и приглашения

```sh
bun --env-file=.env apps/backend/src/cli.ts invite-owner admin
```

Команда выдаёт одноразовую ссылку на 24 часа. Получатель сам задаёт пароль и подключает TOTP. До подтверждения второго фактора редактор недоступен. Резервные коды показываются один раз; сохраните их отдельно от пароля.

Владелец приглашает администраторов и авторов через `/admin`. Автор создаёт черновик и отправляет его на проверку; администратор публикует или отклоняет статью. Доступ к черновикам и изображениям проверяется на API, а не только в интерфейсе.

Если неиспользованное приглашение владельца истекло:

```sh
bun --env-file=.env apps/backend/src/cli.ts renew-owner-invitation admin
```

Если владелец потерял TOTP и резервные коды, восстановление выполняется только с доступом к серверу. Передайте новый пароль через stdin, не через аргументы процесса:

```sh
read -rs -p 'Новый пароль: ' password
printf '%s' "$password" | bun --env-file=.env apps/backend/src/cli.ts recover-owner admin
unset password
```

Команда отзывает сессии и старые коды, меняет пароль и TOTP-секрет. Новый секрет добавьте в аутентификатор и подтвердите код по выданной ссылке в течение 30 минут. Восстановление попадает в журнал действий.

## Источники обновлений и импорт

Секретные `AUTH_LINK` / `LOGIN` и `GLOBAL_AUTH_LINK` / `GLOBAL_LOGIN` настраиваются владельцем только в окружении worker. Не вставляйте их в статьи, логи, задачи или frontend. Исходный Python-проект и его `.env` не читаются автоматически.

Для проверки на локальных игровых файлах без launcher:

```sh
bun --env-file=.env apps/worker/src/cli.ts import-directory /path/to/6p62 assets/weapons/models/weapons/6p62 RU
bun --env-file=.env apps/worker/src/cli.ts import-torrent /path/to/torrentData
bun --env-file=.env apps/worker/src/cli.ts import-json /path/to/sc_data_flat.json RU
bun --env-file=.env apps/worker/src/cli.ts import-archive /path/to/diff_archive.json RU
```

Импорт не меняет исходный каталог. Поддерживаемые ресурсы копируются в content-addressed cache, создаётся снимок и задачи обработки моделей. Оригиналы и результаты хранятся в общем `STORAGE_DIR`; метаданные и история — в PostgreSQL. Для просмотра откройте `/patches`, выберите снимок, затем «Все файлы и модели».

Ограничения ресурсоёмких операций намеренные: максимальные размеры скачивания/распаковки, лимиты геометрии и изображений, одна задача одновременно на процесс worker. Увеличивать их нужно после измерения памяти и времени, а не отключением проверок.

## Проверки

```sh
bun run typecheck
bun run test
bun run lint
bun run build
bun run check:delivery http://localhost:3000
```

Integration-тесты требуют отдельную тестовую БД; без `TEST_DATABASE_URL` они пропускаются, это не подтверждение работоспособности подключения:

```sh
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/bscp_test bun run test
```

Проверка реального MCSB/OL и CPU-рендера:

```sh
MODEL_FIXTURE_DIR=/path/to/model-directory \
MIC_FIXTURE=/path/to/image.mic \
bun run --cwd apps/worker test
```

Worker E2E требует **новую пустую мигрированную БД** и локальный каталог игровых ассетов. Он создаёт снимки/задачи и проверяет lease recovery, rollback, legacy imports, реальную модель, watermark/коллаж и map diff. Повторно используйте новую БД, а не очищайте существующую:

```sh
DATABASE_URL=postgresql://user:password@localhost:5432/bscp_worker_test bun run db:migrate
WORKER_TEST_DATABASE_URL=postgresql://user:password@localhost:5432/bscp_worker_test \
WORKER_ASSET_FIXTURE_ROOT=/path/to/EXBO/assets \
bun test apps/worker/test/worker.e2e.test.ts
```

Тест ожидает `weapons/models/weapons/6p62` с моделью и текстурами, а также `pda/map/r.-11.-2.ol`, `r.-11.-3.ol`, `r.-11.-4.ol`. Fixtures не копируются в Git и не изменяются. Временный storage создаётся в `.runtime/worker-verification/<uuid>`; `WORKER_TEST_ROOT` может задать другое место.

Для форматов без реальных fixtures unit-тесты не заменяют проверку игровых ресурсов. Успешный рендер одной модели не доказывает совместимость всех версий MCSA/MCVD, а запуск синхронизации без launcher credentials не является проверкой авторизованного обновления.

Что проверено при переносе:

- Манифесты: synthetic torrentData с piece hashes, атомарное сохранение снимков, legacy JSON/archive import и added/changed/removed через настоящую БД. Реальный production torrentData без launcher пока не предоставлен.
- Баланс: специализированные парсеры восьми категорий, реальная синхронизация публичного EXBO GitHub archive (1063 предмета), повторный запуск без нового снимка.
- Модели: реальный MCSB 6П62, skeleton/skin, два семейства OL-текстур, четыре CPU PNG-ракурса, watermark и коллаж, integrity оригинала и GLB. В образце нет анимационных clips: их численное соответствие legacy renderer на реальной анимации пока не подтверждено.
- Изображения и карты: реальный MIC, OL map regions, full/preset, added/removed/changed с before/after артефактами. Остальные варианты текстур и TEXARR дополнительно покрыты алгоритмическими тестами, но не всеми игровыми fixtures.
- Очередь: claim, heartbeat, истёкший lease, retries до лимита, успешный finish и rollback без частичных snapshot/job записей.
- Доставка: отдельные контейнеры PostgreSQL/backend/worker/frontend, миграции с нуля, выдача всех 41 кадров; browser flow invite → TOTP → статья с изображением/обложкой → review → publish → public read, mobile layout, готовые игровые превью, результаты задач и отзыв приглашений.

Авторизованные PATCH/SERVERS и сетевые CDN fallback остаются для проверки после самостоятельной настройки launcher владельцем. Секреты не включены в репозиторий. Перенос Telegram-бота намеренно не выполнялся.

## Рендер-пайплайн (server renderer, этапы 1–3)

Пакеты `@bscp/render-contracts`, `@bscp/render-pipeline` и нативный спайк `apps/renderer` выполняют миграцию рендера Xeon из плана `docs/render-migration-plan.md`. Источники не копируются в репозиторий: корpus читается только по env-путям, fixtures выбираются по hash; игровые ресурсы в Git не попадают. Зафиксировано:

- Этап 1 — индекс исходников: `packages/render-pipeline/src/source-set.ts` принимает либо `RENDER_SOURCE_ROOT` с подкаталогами `*_extracted_xeon`, либо отдельные `RENDER_CONFIGS_ROOT`/`RENDER_MATERIALS_ROOT`/`RENDER_SHADERS_ROOT`; namespace refs идут как `assets/<ns>/<path>`, только чтение, matches case-insensitive.
- Этап 2 — lossless-декодеры: `mcmtl.ts` парсит MCMTL директивы, hook kinds и lighting models с хранением исходного текста; `json-strict.ts` ругается на trailing commas и дубли ключей; `catalog.ts` строит item refs + граф зависимостей.
- Этап 3 — shader toolchain: `shaders.ts` разворачивает `#include`, unroll циклы (`#unroll_start`) и hook points, `hooks.ts` сопоставляет hook-имена с файлами `mcsahook`; `spike-plan.ts` комбинирует representative programs; `spike-run.ts` гоняет их через нативный EGL-спайк.

Проверка этапа 3 (нужна local GLES >= 4.3; Mesa llvmpipe даёт 4.6):

```sh
bun run spike:build
RENDER_SOURCE_ROOT=/home/oarer/py/seo bun run spike:report -- --bundle /tmp/opencode/renderer-spike/bundle --out /tmp/opencode/renderer-spike/run
```

В отчёте `gate.failures` пустой и `report.programs[*].status = 'linked'` для mcsa130/world/sun-shadow (7/7) — подтверждено: EGL headless (Mesa llvmpipe), компиляция и линковка архивных шейдеров, readback rgba8 в `capture/000000.rgba` + PNG. Stub-декларации engine-injected uniforms (modelMatrix, quantizationScale, ARRAY_SIZE, HR_ARRAY_SIZE, aTexCordsIO) помечены в спайке как приближения: их настоящие значения и схемы uniform-ов в архивных исходниках не заданы, для продакшена их нужно подтвердить по launcher-специфичным данным. Полный world state (реальные светильники, реальные текстуры, фактический draw) вынесен в следующий этап плана.

### Worker как orchestrator нативного renderer

Production `Dockerfile` собирает бинарь нативного спайка в отдельном `renderer` stage (cmake/build-essential/libegl-dev) и копирует его в worker-image; там установлены runtime-библиотеки Mesa (`libegl1`, `libegl-mesa0`, `libgl1-mesa-dri`) и заданы `EGL_PLATFORM=surfaceless`, `LIBGL_ALWAYS_SOFTWARE=1`, `RENDERER_EXECUTABLE=/app/apps/renderer/build/renderer` — контейнерный smoke-check (manifest с пустым списком programs) даёт `status: ok`. При изменении `apps/renderer` пересоберите образ, который содержит бинарь.

Worker умеет запускать нативный спайк как subprocess в job kind `RENDER` (orchestration остаётся в Bun, renderer не подключается к БД и получает только read-only bundle). Конфигурация worker-окружения:

- `RENDER_SOURCE_ROOT` (или `RENDER_CONFIGS_ROOT`/`RENDER_MATERIALS_ROOT`/`RENDER_SHADERS_ROOT`) — corpus для построения bundle; без него job падает с понятной ошибкой.
- `RENDERER_EXECUTABLE` — путь к бинарю (по умолчанию `apps/renderer/build/renderer`, сборка `bun run spike:build`).
- `RENDER_HOOKS` — набор hook через запятую; `RENDER_TIMEOUT_MS` — убить subprocess при зависании (по умолчанию 240000, потолок совпадает с таймаутом worker job).
- `RENDER_PUBLISH=true` — сохранить PNG captures в storage как `StoredAsset` (с watermark); по умолчанию captures остаются только предпросмотром в job result.
- `RENDER_SCHEDULED=true` — ставить `RENDER` job каждый час при работающем scheduler.

Запуск вручную: `bun --env-file=.env apps/worker/src/cli.ts render-spike`, либо enqueue через `/admin/jobs`. В job result попадают компактный gate (programs/draws/capture/упомянутые ограничения), статус линковки программ и `renderer reported failed status` попадает в `gate.failures`. Спайк рендерит self-contained gradient draw, не игровой кадр; публикация результатов в публичные previews без прохождения gates миграции запрещена.

## Docker

```sh
docker compose --env-file .env up -d --build
```

Compose поднимает PostgreSQL, отдельную миграцию, backend, worker и frontend. Только frontend публикуется на хост; по умолчанию — на `127.0.0.1:3000`. Снаружи используйте HTTPS reverse proxy. `WEB_ORIGIN` должен соответствовать публичному HTTPS-адресу: production-cookie устанавливается с `Secure`.

Первое приглашение в контейнере:

```sh
docker compose --env-file .env exec backend bun apps/backend/src/cli.ts invite-owner admin
```

Рендер-worker работает непривилегированным пользователем. В контейнере Chromium запускается без своего sandbox из-за ограничений container namespaces; сеть страницы рендера ограничена локальными ресурсами, входные форматы и размеры проверяются. Не передавайте renderer произвольные URL или недоверенные HTML/скрипты. В окружениях с поддержкой sandbox можно убрать `CHROMIUM_NO_SANDBOX=1`.

## Резервное копирование

Сохраняйте PostgreSQL через `pg_dump`, том `asset_storage` и отдельно ключ `TOTP_ENCRYPTION_KEY`. Без прежнего ключа сохранённые TOTP-секреты не расшифруются. Одна копия базы не содержит оригиналов и превью ресурсов. Перед обновлением Prisma RC зафиксируйте версии, сделайте backup и проверьте миграции на копии базы. Не используйте reset/drop для исправления drift; применяйте проверяемые миграции.
