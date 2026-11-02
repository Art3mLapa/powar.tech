<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BSCP — руководство для coding agents

## Обзор проекта

BSCP — Bun/TypeScript monorepo для сайта, редакции статей и просмотра игровых обновлений. Workspace scope — `bscp` / `@bscp/*`. Основной runtime — Bun 1.4.3+, frontend собирается на Node.js 24, данные хранятся в PostgreSQL (production/dev Compose использует PostgreSQL 18), Chromium нужен worker-у для генерации превью.

Корневой `package.json` описывает workspaces `apps/*` и `packages/*`, а зависимости фиксируются в `bun.lock`. Корневые настройки — `biome.json`, `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example` и `docs/development.md`. Файл `.env` содержит локальные секреты и не должен читаться, копироваться или добавляться в Git.

## Архитектура и границы модулей

### Приложения

- `apps/frontend` — Next.js 16 + React 19 приложение с App Router. `src/app` содержит маршруты и route handlers, `src/views` — экранную логику, `src/components` — переиспользуемые UI-компоненты, `src/services` — HTTP-вызовы Axios, `src/queries` — опции TanStack Query, `src/lib` — локальные преобразования и утилиты. Frontend обращается к `/api/v1`; `next.config.ts` проксирует этот путь на `BACKEND_ORIGIN` и задаёт standalone build, security headers и кеширование `/frames`.
- `apps/backend` — Elysia `2.0.0-rc.0` API на Bun. `src/index.ts` запускает приложение и закрывает database client при SIGTERM/SIGINT. `src/app/index.ts` задаёт общие headers, origin/CSRF-проверку, rate limit для auth, `/health`, `/ready` и группу `/api/v1`. Route-модули разделены на `api/auth`, `api/articles`, `api/admin` и `api/patches`; `src/lib` содержит crypto, security, ошибки, jobs и recovery.
- `apps/worker` — PostgreSQL-backed очередь и обработчик ресурсоёмких задач. `src/index.ts` планирует задачи при `SCHEDULER_ENABLED=true`, claim-ит job, запускает отдельный `task.ts` subprocess, обновляет lease heartbeat, ограничивает выполнение пятью минутами и делает retry/cancel/fail. `src/patches.ts` импортирует манифесты и считает изменения, `src/assets.ts` декодирует и рендерит игровые ресурсы, `src/data.ts` синхронизирует localization/balance/servers и строит карты, `src/queue.ts` реализует dedupe/lease/retry, `src/cli.ts` предоставляет локальные импорты.
- `apps/renderer` — отдельный исследовательский C++17 executable, не workspace-пакет. CMake собирает headless EGL/OpenGL spike из `src/*.cpp`; он читает versioned JSON manifest, компилирует/линкует GLSL, выполняет тестовый draw/readback и пишет JSON report и RGBA capture. Это не готовая замена worker renderer и не подключается к базе.

### Пакеты

- `packages/contracts` — общие Zod-схемы и frontend-safe типы. Здесь находятся username/password/auth, invitation, article и paging schemas. Не импортировать сюда database runtime или серверные секреты.
- `packages/database` — Prisma ORM PostgreSQL 8 contract/runtime/migrations. Источник схемы — `src/prisma/contract.prisma`; `contract.json` и `contract.d.ts` — сгенерированные companion files, runtime — `src/prisma/db.ts`, CLI — `prisma.config.ts`. Модели включают аккаунты/2FA, приглашения, статьи и ревизии, assets, game snapshots/files/changes, jobs, data snapshots и server samples.
- `packages/game-assets` — ограниченные декодеры игровых форматов и CPU asset pipeline: binary/LZ4/ZIP, MCSA/MCSB model streams, MCMTL/textures, MIC/OL/TEXARR, maps, manifests/diffs, balance/servers, GLB/PNG preview, watermark и collage. Сохраняйте license notices `LICENSE.sc-file` и `LICENSE.scmapmerge`.
- `packages/design-tokens` — существующие визуальные tokens в `tokens.css`; package экспортирует только этот CSS.
- `packages/render-contracts` — TypeScript contracts для render IR, diagnostics, material plans, bundles, draw records, backend/program/capture reports и unsupported states.
- `packages/render-pipeline` — исследовательский pipeline для индексации внешнего source corpus, strict JSON, namespace/reference graph, lossless MCMTL, shader include/feature/hook composition, catalog/material plans и native spike manifests. Исходные игровые каталоги читаются только по env-путям и не должны копироваться в репозиторий.

### Поток данных и runtime

1. Browser вызывает Next same-origin `/api/v1` и получает `bscp_session` cookie; Next rewrite передаёт API backend-у.
2. Backend владеет authentication, authorization, article mutations, review/publish workflow, media access и job endpoints. Все чувствительные проверки должны оставаться на API, а не только в UI.
3. Backend и worker используют одну PostgreSQL БД и один абсолютный `STORAGE_DIR`. Worker хранит оригиналы/промежуточные/готовые assets в content-addressed storage, а metadata, snapshots и job history — в БД.
4. Worker не выполняет тяжёлый рендер внутри HTTP handler или Next.js. Job subprocess получает конкретный job id и публикует результат только после успешного завершения.
5. Frontend отображает опубликованные статьи, редакцию, admin/jobs, patch snapshots, files/models, maps и server data. Landing page сохраняет существующую frame-sequence animation и media assets.

## Ключевые конфигурации и команды

### Корневые команды

Запускайте команды из корня с Bun:

```sh
bun install --frozen-lockfile
bun run dev                 # frontend: Next dev на 0.0.0.0
bun run dev:backend         # backend: bun --watch
bun run dev:worker          # worker: bun --watch
bun run typecheck           # frontend, backend, worker и render/game packages
bun run test                # frontend, backend, worker и render/game packages
bun run lint                # biome lint apps packages
bun run build               # typecheck + frontend next build
bun run start               # frontend production server
bun run start:backend
bun run start:worker
bun run db:emit             # packages/database: prisma contract emit
bun run db:migrate          # packages/database: prisma db migrate
bun run check:delivery http://localhost:3000
bun run check:system
```

Дополнительные scripts:

- `bun run prepare:frames` подготавливает landing frame assets.
- `bun run spike:build` выполняет CMake configure/build в `apps/renderer/build`.
- `bun run spike:report -- --run` запускает `packages/render-pipeline` spike report; `--bundle` и `--out` позволяют задать bundle и output directory.

Package-local scripts определены в соответствующих `package.json`: frontend использует `node --experimental-strip-types --test tests/*.test.ts`, backend — `bun test --isolate`, worker — `bun test`, render packages — `bun test src/ --pass-with-no-tests`, game-assets — `bun test --pass-with-no-tests`.

### TypeScript и форматирование

`biome.json` — единственный общий formatter/linter config:

- tabs, width 4, LF, line width 80;
- TypeScript/JavaScript: single quotes, semicolons omitted, trailing commas in ES5 positions, double quotes in JSX attributes;
- TypeScript strict mode, no emit, bundler module resolution;
- Biome lint проверяет accessibility, unused imports, hook rules, JSX keys, unsafe HTML, sorted Tailwind classes и `useConst`;
- не отключайте проверки без конкретной причины. Следуйте локальному стилю файла; не добавляйте комментарии, которые просто повторяют код.

Frontend использует alias `@/*` → `apps/frontend/src/*`. Не переносите route composition в `views`, HTTP-вызовы в routes или database queries во frontend components: сохраняйте текущие границы `app` / `views` / `services` / `queries`.

## Локальная разработка и окружение

Скопируйте `.env.example` в собственное окружение и не коммитьте его. Обязательные значения для полного стека — `POSTGRES_PASSWORD`, `DATABASE_URL`, `TOTP_ENCRYPTION_KEY` (64 hex characters) и `WEB_ORIGIN`; `STORAGE_DIR` должен быть абсолютным. `BACKEND_ORIGIN`, bind/ports, `CHROMIUM_PATH`, scheduler flags и launcher credentials задаются отдельно.

Для независимых локальных секретов:

```sh
openssl rand -hex 32   # отдельно для POSTGRES_PASSWORD и TOTP_ENCRYPTION_KEY
```

Dev Compose самодостаточен и поднимает PostgreSQL, migration service, backend, worker и frontend:

```sh
docker compose --env-file .env -f docker-compose.dev.yml up -d --build
```

- PostgreSQL по умолчанию опубликован только на `127.0.0.1:55439` (`POSTGRES_PORT`).
- Backend доступен на `127.0.0.1:3001` (`BACKEND_PORT`), frontend — на `127.0.0.1:3000` (`FRONTEND_PORT`).
- Исходники приложений и нужных workspace-пакетов монтируются в контейнеры, Bun/Next работают в watch mode.
- Dev worker запускается для очереди и ручных jobs, но scheduler выключен.
- После изменения contract/migrations повторяйте `docker compose --env-file .env -f docker-compose.dev.yml run --rm migrate`.
- `WEB_ORIGIN` должен быть точным origin без пути. При изменении `BACKEND_ORIGIN` перезапустите frontend.

Первого владельца создают через backend CLI:

```sh
bun --env-file=.env apps/backend/src/cli.ts invite-owner admin
```

При истёкшем приглашении используется `renew-owner-invitation`; восстановление владельца — `recover-owner`. Новый пароль передавайте через stdin, а не аргументом процесса. Приглашения одноразовые, обязательны TOTP и recovery codes.

Локальные игровые данные импортируются worker CLI без изменения исходного каталога:

```sh
bun --env-file=.env apps/worker/src/cli.ts import-directory /path/to/6p62 assets/weapons/models/weapons/6p62 RU
bun --env-file=.env apps/worker/src/cli.ts import-torrent /path/to/torrentData
bun --env-file=.env apps/worker/src/cli.ts import-json /path/to/sc_data_flat.json RU
bun --env-file=.env apps/worker/src/cli.ts import-archive /path/to/diff_archive.json RU
```

Поддерживаемые входы копируются в content-addressed cache, создают snapshot и processing jobs. Размеры downloads/archives, geometry/images, directory depth, file count и один worker task одновременно ограничены намеренно; не снимайте лимиты без замеров памяти/времени.

## База данных и миграции

Перед изменением `packages/database/src/prisma/contract.prisma` прочитайте `packages/database/prisma-8.md` и сохраните строку `// use prisma-8`. После изменения contract обязательно запускайте:

```sh
bun run db:emit
bun run db:migrate
```

Не редактируйте вручную `src/prisma/contract.json`, `src/prisma/contract.d.ts` или migration snapshots. Исторические migrations/snapshots должны оставаться неизменными. Для существующей установки сначала сделайте backup PostgreSQL и storage; не используйте reset/drop для исправления Prisma drift.

Account identity — только `username` и пароль. Username обрезается, приводится к lowercase, имеет длину 3–32 и формат `[a-z0-9][a-z0-9_-]*`; email и отдельное registration name не возвращайте и не добавляйте в новую схему. Сохраняйте прежние IDs и связи при миграциях аккаунтов. Cookie сессии называется `bscp_session`.

## Тестирование

Минимальная проверка изменения в корне:

```sh
bun run typecheck
bun run test
bun run lint
bun run build
```

Integration tests backend и worker запускаются только при наличии отдельной тестовой БД. Без `TEST_DATABASE_URL` тесты `skip`, что не подтверждает подключение к PostgreSQL:

```sh
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/bscp_test bun run test
```

Worker E2E нельзя запускать на рабочей или существующей БД. Нужна новая пустая migrated database и локальный asset corpus:

```sh
DATABASE_URL=postgresql://user:password@localhost:5432/bscp_worker_test bun run db:migrate
WORKER_TEST_DATABASE_URL=postgresql://user:password@localhost:5432/bscp_worker_test \
WORKER_ASSET_FIXTURE_ROOT=/path/to/EXBO/assets \
bun test apps/worker/test/worker.e2e.test.ts
```

Тест ожидает `weapons/models/weapons/6p62/6p62.mcsb`, соответствующие textures и map regions `pda/map/r.-11.-2.ol`, `r.-11.-3.ol`, `r.-11.-4.ol`. Временный storage создаётся в `.runtime/worker-verification/<uuid>`; `WORKER_TEST_ROOT` меняет его расположение. Fixtures не копируются в Git и не изменяются.

Для real-format checks game-assets:

```sh
MODEL_FIXTURE_DIR=/path/to/model-directory \
MIC_FIXTURE=/path/to/image.mic \
bun run --cwd apps/worker test
```

`bun run check:system` — browser/system E2E, а не простой health check. Он требует локальный frontend, `TEST_DATABASE_URL`, тестовый `TOTP_ENCRYPTION_KEY`, Chromium и предварительно импортированные игровые assets. Скрипт проверяет invite → register → TOTP/recovery → article image/cover → review/publish → public read, безопасный Markdown, job outputs, invitation revoke, реальные model previews и mobile layout. Артефакты пишутся в `.runtime/verification`.

`bun run check:delivery <origin>` проверяет собранную доставку frontend. После тестов удаляйте только созданные ими лишние outputs/logs; `.runtime`, `.next`, `*.tsbuildinfo` и renderer build находятся в ignore rules.

## Production и Docker

`docker-compose.yml` собирает и запускает отдельные `postgres`, `migrate`, `backend`, `worker` и `frontend` services:

```sh
docker compose --env-file .env up -d --build
```

Compose ждёт healthcheck PostgreSQL, выполняет отдельный migration service до backend/worker и healthchecks backend `/ready` и frontend `/api/health`. Только frontend публикуется на host (по умолчанию `127.0.0.1:3000`); backend и worker общаются внутри Compose network. Backend и worker должны использовать одну БД и volume `asset_storage` с одним `/app/runtime/storage`. Для внешнего доступа нужен HTTPS reverse proxy, а `WEB_ORIGIN` должен совпадать с публичным HTTPS origin, чтобы production cookie имела `Secure`.

`Dockerfile` имеет stages:

- `dependencies` — Node 24 + Bun 1.4.3 и frozen install;
- `builder` — Next standalone build;
- `backend` — непривилегированный Bun API;
- `worker` — непривилегированный Bun worker с apt-installed Chromium и собранным в отдельном `renderer` stage native спайком (`EGL_PLATFORM=surfaceless`, `RENDERER_EXECUTABLE=/app/apps/renderer/build/renderer`);
- `frontend` — standalone Node server.

Worker запускает Chromium с `CHROMIUM_NO_SANDBOX=1` в контейнерном окружении из-за namespace ограничений. Не передавайте renderer произвольные URL, HTML или scripts; входные пути/форматы/размеры должны проходить существующие проверки. В окружении с рабочим Chromium sandbox этот флаг можно убрать.

Для обновления существующей установки перед миграцией сохраняйте PostgreSQL dump, asset storage и `TOTP_ENCRYPTION_KEY`. Если переиспользуются прежние данные, указывайте точные прежние `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_VOLUME_NAME`, `ASSET_STORAGE_VOLUME_NAME`, пароль БД и TOTP key. Не подключайте один PostgreSQL volume к двум запущенным серверам.

## Безопасность и доменные ограничения

- Origin должен быть точным HTTP(S) origin без path/credentials; backend проверяет origin и preflight, auth POST ограничен по IP.
- Все входы проходят Zod schemas и bounded parsing. Не ослабляйте path traversal, decompression, archive, file-size, geometry, image, request-body или job-timeout ограничения.
- Секреты `AUTH_LINK` / `LOGIN` и `GLOBAL_AUTH_LINK` / `GLOBAL_LOGIN` задаются только в окружении worker. Не помещайте их в article content, jobs, logs, frontend или shared contracts.
- Не читайте credentials из исходного Python-проекта, reference projects или их `.env`; launcher secrets настраиваются явно.
- Backend проверяет доступ к draft/media/assets на API. Не считайте UI visibility механизмом authorization.
- Markdown должен проходить текущий safe renderer; не добавляйте raw HTML/script execution. Сохраняйте security headers из frontend и backend.
- Worker и renderer не должны скачивать произвольные URLs или подключаться к БД из native renderer. Renderer получает read-only bundle/job manifest и пишет ограниченный output.
- Игровые fixtures и внешние source corpora не добавляйте в Git. Перед распространением исходных GLSL/assets проверяйте лицензии.

## Render pipeline: текущий статус

`docs/render-migration-plan.md` — исследовательский план полного переноса renderer, а не утверждение о завершённой pixel parity. Текущие пакеты реализуют этапы индексации corpus, strict JSON, MCMTL IR, dependency graph, shader include/unroll/hook composition, catalog/material planning и EGL capability spike.

Source corpus задаётся через `RENDER_SOURCE_ROOT` с подкаталогами `*_extracted` либо через `RENDER_CONFIGS_ROOT`, `RENDER_MATERIALS_ROOT`, `RENDER_SHADERS_ROOT`. Результаты должны сохранять diagnostics, unresolved/unsafe refs и provenance. Исполняемый spike требует локального GLES/OpenGL capability (проверенный путь — Mesa llvmpipe) и собирается так:

```sh
bun run spike:build
RENDER_SOURCE_ROOT=/path/to/source-corpus \
bun run spike:report -- --bundle /tmp/renderer-spike/bundle --out /tmp/renderer-spike/run
```

Native spike компилирует representative shader programs и делает self-contained gradient capture; успешная линковка не доказывает полный игровой draw, а stub engine uniforms и отсутствие реальных world state/animation должны оставаться явно обозначенными. Не называйте полный renderer готовым, пока не проверены реальные материалы, текстуры, анимации, сцены и соответствующие fixtures.

## Где искать изменения

- Сайт и маршруты: `apps/frontend/src/app`, `apps/frontend/src/views`, `apps/frontend/src/components`.
- API и permissions: `apps/backend/src/app/api`, `apps/backend/src/lib`.
- Queue/tasks/import/render jobs: `apps/worker/src`.
- Shared request/response contracts: `packages/contracts/src`.
- Database contract/client/migrations: `packages/database/src/prisma`, `packages/database/migrations`.
- Game format support: `packages/game-assets/src`.
- Render IR/pipeline: `packages/render-contracts/src`, `packages/render-pipeline/src`.
- Native capability spike: `apps/renderer/src`, `apps/renderer/CMakeLists.txt`.
- Setup/recovery/testing/deployment details: `docs/development.md`; render scope and blockers: `docs/render-migration-plan.md`.
