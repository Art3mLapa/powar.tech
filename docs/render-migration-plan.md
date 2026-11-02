# BSCP: план полного переноса рендера

Статус: исследовательский план, не реализация. Исходные каталоги прочитаны только для анализа; игровые ресурсы не изменяются и автоматически не добавляются в Git.

## 1. Цель и границы

Перенести в независимый серверный renderer получение сцены из конфигов, декодирование моделей/текстур, материалы, сборку шейдеров, освещение, анимации и render passes. Результат должен воспроизводить поведение исходных ресурсов, а не только выдавать картинку похожего объекта.

Разделить два профиля:

- `catalog`: предметы, оружие, броня, обвесы, скины, фиксированные позы/кадры, PNG и turntable. Первый вводимый в эксплуатацию профиль.
- `scene`: окружение, погода, динамические источники и тени, растительность, вода, частицы и постобработка. Обязательная следующая часть **полного** переноса, не доказанная реализацией каталожных картинок.

Полное воспроизведение игровой логики, сетевого клиента, UI и звука не является задачей renderer. Однако связанные с картинкой параметры GUI-иконок, анимационные состояния и эффекты должны иметь воспроизводимые входы. GUI-шейдеры из архива инвентаризируются отдельно: если нужна именно копия экранов игрового клиента, это дополнительный профиль, а не неявная часть каталога.

Нельзя объявлять полный перенос завершённым, пока профиль `scene` и реальные анимации не проверены. Наличие GLSL и материалов само по себе не восстанавливает CPU-код движка, состояние OpenGL и игровые defaults.

## 2. Что подтверждено исходными данными

По `_manifest.json` и фактическому обходу материалов:

- `configs_extracted_xeon`: 6 233 файла; среди них 837 файлов `weapons/items`, 362 `weapons/anims`, 1 596 `effects/weather`, 904 `effects/particles`, 457 `highpoly/character`.
- `shaders_extracted_xeon`: 333 файла, в том числе 212 в `effects/shaders`.
- `materials_extracted_xeon`: 10 533 MCMTL-файла. Внутри найдено 9 610 деклараций `lighting model base`, 7 182 `pbr`, 1 614 `glass`, 212 `unlit`. Это количества деклараций, **не** уникальных файлов. Встречаются также `1`, `2`, `body`, `basee`: их семантику нельзя автоматически приравнивать к известному режиму.

Примеры, определяющие архитектуру:

1. `configs_extracted_xeon/assets/weapons/items/lmg/20179_6p62.json:107` задаёт модель, MCMTL и LOD; строки 123–128 — поворот и масштаб. Строки 171–176 ссылаются на внешний MCVD и SAC. Следовательно, отсутствие clips в самой геометрии не означает отсутствие анимации предмета.
2. `materials_extracted_xeon/assets/weapons/models/weapons/6p62/6p62.mcmtl:17` содержит PBR, отдельные specular/gloss maps, `alpha as gloss` и dual skin mask. Полностью металлический стандартный материал это не воспроизводит.
3. `materials_extracted_xeon/assets/stalker/models/armor/kim_topaz/topaz.mcmtl:5` задаёт отдельные transparency/blending/factor для стекла и другой материал тела. Нельзя скрывать все линзы по имени mesh.
4. `configs_extracted_xeon/assets/gameobjects/material_patchs.json:1` задаёт patches `frozen`, `snowed`, `inside` и параметры shader hooks.
5. `configs_extracted_xeon/assets/effects/weather/styles/[BASE WEATHER]/[DUNGEON] Enlightened.json:4` содержит наследование по `parentStyleID`, локализованные имена настроек и locked-поля. Нужен resolver, а не чтение одного JSON.
6. `configs_extracted_xeon/assets/effects/particles/weapons/flash/fp_flash_default_flashhider.efkefc.json:1` содержит только параметры/привязку к кости; это не полное описание бинарной системы частиц.
7. `shaders_extracted_xeon/assets/effects/shaders/mcsa130.vert:95` восстанавливает bitangent из упакованных W-компонент; далее использует квантизацию, skinning, UV2, vertex colors и blend shapes.
8. `shaders_extracted_xeon/assets/effects/shaders/mcsa130.frag:179` восстанавливает Z нормали из XY; gloss/specular выбираются по каналам, PBR использует собственную BRDF LUT и envmaps. Строки 388–435 определяют emission/bloom, exposure, fog, tone mapping, gamma и premultiplied alpha.
9. `shaders_extracted_xeon/assets/effects/shaders/module/light.frag:25` использует SSBO/std430, а строка 36 — `samplerCubeArrayShadow`. В `grass430.vert:1` указан GLSL 430; есть также geometry shaders. Это не непосредственно исполняемый WebGL2-пакет.

## 3. Разрыв с текущей реализацией

- `packages/game-assets/src/materials.ts:4`: парсер извлекает четыре текстурные ссылки и сводит alpha к одному признаку; пропускает остальные MCMTL-директивы.
- `packages/game-assets/src/render.ts:29`: specular преобразуется в roughness как `1 - green`, остальные каналы теряются. Исходные shader uniforms требуют другого, материал-зависимого выбора каналов.
- `packages/game-assets/src/render-browser.ts:25`: всем mesh назначается `MeshStandardMaterial`, большинство материалов получают `metalness=1`; линзы обнуляются по имени, все поверхности двусторонние. Это нужно убрать из authoritative renderer.
- `packages/game-assets/src/model.ts:27`: часть упакованных компонент и потоков пропускается; текущий `ModelMesh` не содержит tangent, UV2, vertex colors и blend shape данных.
- `apps/worker/src/assets.ts:17`: MCMTL выбирается по совпадению имён и эвристикам. Полный перенос должен выбирать material library из конкретного item/style/config.
- `render-browser.ts` не проигрывает анимацию и не реализует исходный multipass pipeline. Уже проверенный статический 6П62 не доказывает его поддержку.

## 4. Рекомендуемая архитектура

Сохранить Bun/TypeScript для orchestration, API, очереди и подготовки ресурсов. Для полного authoritative renderer использовать отдельный native executable: **C++ + desktop OpenGL 4.3+, EGL headless + Mesa**, с возможностью аппаратного драйвера. C++/EGL/Mesa здесь предлагаемые новые зависимости, не уже установленная инфраструктура: сначала capability spike и замеры.

Причина выбора — прямое соответствие существующим GLSL, SSBO, geometry stages и shadow cube arrays. Переписывание всего на WebGPU/WGSL возможно, но увеличивает объём перевода и площадь визуальных расхождений. WebGL2 подходит для облегчённого viewer, но не как единственная основа обещанного полного переноса.

Первый gate: подтвердить создание headless context, реальную GL-версию, расширения, компиляцию репрезентативных вариантов и framebuffer readback в целевом Docker-окружении. Для CPU-only — Mesa llvmpipe; это не Chromium SwiftShader. Не обещать прирост производительности до измерений. Если целевое окружение не обеспечивает нужные функции, согласовать смену backend, а не отключать эффекты незаметно.

Предлагаемая структура:

```text
packages/game-assets/       бинарные декодеры без потери исходных атрибутов
packages/render-contracts/  RenderRequest, SceneIR, MaterialIR, diagnostics
packages/render-pipeline/   config resolver, graph, shader composition, cache
apps/renderer/             native executable, GL resources, passes, readback
apps/worker/               подготовка bundle, запуск renderer, публикация
apps/backend/              доступы, задания и статусы
apps/frontend/             готовые кадры и облегчённый viewer
```

Renderer не подключается к БД и не скачивает произвольные URL. Worker передаёт read-only bundle по content hash и валидированный job manifest; ответ — manifest артефактов, характеристики backend, timings и diagnostics. IPC: versioned JSON manifest + бинарные buffers через ограниченный временный каталог/stdio. Логи — stderr, машинный результат — stdout. Тяжёлый рендер остаётся вне Elysia и Next.js.

GLB остаётся форматом экспорта и упрощённого viewer, но **не единственным промежуточным представлением**: стандартный glTF не выражает все исходные hooks и render states.

## 5. Этапы реализации и критерии выхода

### Этап 0. Зафиксировать эталоны и требования

- Разделить «совпадение со старым Python renderer» и «совпадение с игрой». Сохранить старые кадры как regression baseline, но не использовать их как единственную истину.
- Зафиксировать версию архивов, hash каждого источника, камеру, размер кадра, lighting/weather preset, позу, время, seed, скин, attachments и render settings.
- Получить эталонные кадры/состояния из доступного легального игрового клиента либо исходной реализации. Отдельно выяснить правила CPU defaults, hook ordering и состояния blend/depth/cull.
- Собрать fixtures: оружие, броня со стеклом, attachment с collimator, unlit/emission, skin-mask/dual-mask, animated texture, overheat/distortion, skinned mesh, внешняя MCVD-анимация, растительность, вода и частицы.

Выход: воспроизводимый reference corpus и перечень неизвестных параметров. Пока нет игрового эталона, корректно говорить о структурном переносе, но не доказанном pixel parity.

### Этап 1. Индекс и граф зависимостей

- Инвентаризировать все файлы, MCMTL directives/hooks, shader stages/includes и config references. Сохранять неизвестные токены и исходные строки.
- Реализовать namespace resolver (`weapons:...`), контекстные относительные пути, виртуальные расширения и связь MCMTL DDS-ссылки с реальным OL/DDS payload. Приоритеты и case sensitivity подтвердить источниками; коллизии регистра диагностировать.
- Выявить синтаксис JSON, используемый архивом: комментарии/запятые/массивы/inheritance нельзя молча исправлять универсальной эвристикой.
- Разрешать item → variant/style/patch → model/LOD → material → texture/hook → include → LUT/envmap; анимационные ресурсы — отдельной веткой.
- Не смешивать версии конфигов, шейдеров, моделей и текстур разных snapshots. Построить reverse dependencies для повторного рендера при изменении материала/шейдера.

Выход: каждый input проходит индексирование; unresolved dependency имеет явную причину. Полнота обнаружения не равна поддержке исполнения.

### Этап 2. Полноценные промежуточные представления

- Расширить модель: original coordinate conventions/units, winding, quantization, positions, normals, tangents/bitangents, UV0/UV1, vertex colors, submeshes, bones/weights, bind pose, morph/blend shape streams.
- Разделить декодеры MCSB/MCSA и внешнего MCVD, подтвердить версии и форматы по реальным payload; не считать любой MCVD файлом MCSA только из-за расширения.
- MCMTL parser должен сохранять порядок и повторения, `mtlType`, version, lighting, colors, exponent, maps/channel bindings, alpha/gloss/specular flags, render states, hooks и их параметры.
- Ввести `SceneIR`, `MaterialIR`, `AnimationIR`, `RenderProfile` и документированные mappings source → IR. Не заменять недостающую семантику предположениями по имени файла.
- Текстурный декодер сохраняет alpha, precision, compression metadata и mips; color space определяется ролью с учётом shader math. Избежать двойной gamma-конверсии и уничтожения mask-каналов.

Выход: round-trip/semantic tests на реальных материалах; ни один требуемый исходный атрибут не теряется до shader stage.

### Этап 3. Shader toolchain и native capability spike

- Реализовать разрешение `#include`, feature defines, `#unroll_start/#unroll_end`, hook insertion points, `#uniform_definitions`, `#model_matrix_decryption`.
- Составить явный registry hook → вставки/uniforms/samplers/defines/стадии и ordering constraints. Не предполагать соответствие MCMTL hook одному GLSL-файлу с тем же именем.
- Сохранять исходные GLSL и минимальные compatibility transformations; generated code снабжать source maps/`#line`, полной диагностикой compile/link.
- Выделить observed shader permutations из графа материалов вместо полного декартова произведения flags; fingerprint включает defines/hooks/исходники/backend.
- Проверить GL limits: UBO/SSBO layout, texture/sampler counts, vertex attributes, bone uniforms, MRT, float targets, shadow samplers. Ошибка ресурса не должна выдаваться за успешный fallback.

Выход: representative base/PBR/glass/unlit, skinning, hooks, shadow и world-stage variants компилируются и дают проверяемый кадр на CPU и выбранном GPU backend.

### Этап 4. Материалы и каталожный рендер

- Перенести base, PBR, glass и unlit по исходным формулам; BRDF LUT, diffuse/specular envmaps, выбор каналов gloss/specular/AO, reconstruction normals и tangent space.
- Перенести transparency, alpha testing/fwidth, alphaFactor, premultiplied blending, depth write/test, sorting, culling/back faces. Удалить эвристики «все линзы чёрные», «всё metalness=1», «всё DoubleSide».
- Восстановить skin mask/dual mask, recolor, decal/sticker, worn-out, material patches. Затем collimator, animation/UV scrolling, overheat, phantom, distortion и остальные observed hooks.
- Учитывать item bake centers, transform/scale, LOD, style overrides, attachments и позу; для неизвестной конфигурации использовать явно маркированный neutral profile.
- Проверять raw output до watermark; watermark/коллаж остаются отдельной доставочной стадией.

Выход: каталожные fixtures соответствуют эталонам; неподдержанный режим получает `unsupported`, а не картинку, отмеченную как точная.

### Этап 5. Анимация и сборка предметов/персонажей

- Найти внешние MCVD и SAC, skeleton/rig/attachment references, legacy/new animation paths. `.anm.json` с transform-параметрами не считать контейнером keyframes.
- Воспроизвести bind pose, local/global transforms, interpolation, handedness, quaternion conventions, bone remapping, 1/2/4 weights и blend shapes.
- Разделить воспроизведение фиксированного clip/time и полноценную evaluation state machines/casts. Для server capture состояние задаётся входом; gameplay-зависимые значения не берутся случайно.
- Поддержать first/third person poses, hands, equipment, weapon parts, attachments, clipping и необходимые IK/layers, если они влияют на заявленные профили.
- Зафиксировать deterministic time/seed для sprite animation, shader hooks, particles и turntable.

Выход: реальные анимированные fixtures проверены в нескольких фиксированных временах, включая attachment transforms. Статическая модель без clips этот gate не закрывает.

### Этап 6. Освещение, окружение и полная последовательность проходов

- Восстановить фактический render graph из sampler dependencies, движкового runtime и reference captures. Не считать порядок GLSL-файлов порядком исполнения.
- Реализовать sun/point/spot lights, light buffers и visibility/tile lists, sun shadows, point shadow cube arrays; корректные depth/bias/coordinate conventions.
- Реализовать envmap generation/prefiltering и BRDF LUT, lightmaps/3D lightmaps; weather hierarchy/regions/time-of-day со всеми требуемыми defaults.
- Добавить sky/clouds/skyobjects, terrain/blocks, grass/geometry stages/wind/LOD, воду, fog, distortion и depth-aware прозрачность.
- Разобрать бинарные Effekseer-ресурсы и runtime: сначала проверить доступность/совместимость официального native runtime и лицензий. JSON sidecar не заменяет effect asset и emitter simulation.
- Реализовать SSAO, bloom, godrays, compositing, LUT/color grading и FXAA в доказанном порядке. Не переносить tone mapping/gamma в «обычное финальное место», если исходный shader применяет их иначе.

Выход: воспроизводимые world/scene fixtures с тенями, стеклом, водой, частицами и изменением погоды. Любые отсутствующие scene formats/runtime assets остаются явными блокерами полного профиля.

### Этап 7. Worker, API, кэш и безопасная эксплуатация

- Существующий worker запускает renderer subprocess; отмена/таймаут/lease heartbeat должны корректно завершать всё дерево процессов.
- Новые входы: profile, camera, item/style/patch, pose/clip/time, lighting/weather и output settings. Проверять их shared Zod-схемами; не разрешать HTTP-клиенту произвольный GLSL или файловый путь.
- Ключ кэша: все транзитивные input hashes, IR/compiler/renderer versions, backend/driver class, profile, camera, time/seed и output settings.
- Публикация outputs атомарная; хранить provenance, качество `exact/approximate/unsupported`, предупреждения, timings и renderer version. Не выдавать старый кэш за результат нового renderer.
- Ограничить память, размер textures/geometry, число lights/passes, wall time, stdout/stderr и временный storage. Без сети, без root, источники read-only, изолированная writable output directory.
- Подготовить Docker image с закреплёнными native/Mesa зависимостями, headless EGL и capability report. Для GPU — отдельная конфигурация, без требования GPU к обычному API.
- В админке: запуск/повтор, прогресс и понятная причина неподдержанного ресурса; frontend получает готовые артефакты и metadata, не запускает native shaders.

Выход: job проходит через реальную БД/очередь/контейнер, публикуется и открывается на сайте; cancellation/retry не оставляют частичные публикации.

### Этап 8. Приёмка, производительность и переключение

- Unit: parser/resolver, inheritance, channel packing, quaternion math, graph/cache invalidation.
- Contract/compile: все наблюдаемые material/hook/permutation combinations имеют определённую обработку или явный blocked/unsupported статус; никаких неизвестных молча проигнорированных директив.
- Image regression: одинаковые camera/pose/time/light, raw кадры до watermark; отдельные сравнения silhouette/depth/normals, alpha boundaries, colors и specular highlights. Для сцен — masks и temporal samples.
- Предлагаемый начальный ориентир для согласованного одинакового backend: SSIM >= 0.99 на статических эталонах плюс отдельные ограничения на alpha/silhouette. Это ещё не измеренный результат и не универсальная гарантия: пороги фиксируются на этапе 0; глобальная метрика не заменяет проверку локальных дефектов.
- Между llvmpipe/GPU использовать отдельно согласованные допуски, сохраняя backend provenance. Не обещать битовую идентичность разных драйверов.
- Замерить cold/warm startup, compile time, median/p95 render time, peak RSS/VRAM, throughput и cache hit rate на фиксированных разрешениях/сценах. Численные бюджеты согласовать после spike, а не обещать ускорение относительно Python без измерений.
- Запустить shadow mode рядом с текущим renderer; сравнить результаты на реальном корпусе. Затем feature flag → catalog canary → scene canary → основной renderer. Старый путь оставить временно для rollback, явно маркируя approximate, и удалить после закрытия gates.

Выход: приняты обе категории `catalog` и `scene`, реальные анимации, весь согласованный compatibility corpus, worker/container E2E и эксплуатационные бюджеты. Если world resources или игровые эталоны не получены, результат остаётся частичным с перечислением blockers.

## 6. Что требуется дополнительно

Три каталога дают большую часть декларативной стороны рендера, но недостаточны для обещания полного соответствия:

- согласованный snapshot бинарных моделей/текстур/MCVD, SAC/casts и всех транзитивных dependencies;
- BRDF LUT, environment maps, noise/LUT textures и данные lightmaps, если они не генерируются восстанавливаемыми проходами;
- геометрия и scene/world formats для окружения, бинарные effect files и emitter runtime;
- engine defaults: hook composition, feature flags, render state/pass ordering, lighting/environment generation, camera/animation conventions;
- референсные кадры с известными состояниями;
- требования к целевому CPU/GPU, качеству, latency и размеру batch.

Для каждой зависимости сначала проверить наличие в разрешённом asset snapshot, затем оформить недостающее. Не читать launcher credentials и не загружать игровые архивы без отдельного разрешения; проверить права на включение исходных GLSL/assets в распространяемые образы.

## 7. Очерёдность и ближайший исполнимый шаг

Сначала этапы 0–3: corpus/dependency index, lossless IR и headless OpenGL spike. Затем 4–5 дают проверенный каталог и анимацию. Только после этого этап 6 закрывает полный scene pipeline; этапы 7–8 интегрируются постепенно и завершают переключение.

Первый вертикальный срез: **20179_6p62.json → explicit MCMTL → исходные PBR shaders → корректные gloss/normal/skin-mask → фиксированная камера → raw PNG**, с журналом всех зависимостей. Добавить topaz/glass и unlit/emission как отрицательную проверку универсального PBR. При отсутствии BRDF/envmap/skin inputs не выдавать приближённый кадр за завершённый срез.

Длительность и окончательный выбор native bindings/toolchain оценивать после этих gates. Перенос всех перечисленных эффектов — отдельный renderer subsystem, а не небольшая правка текущего Three.js material.
