export const balanceCategories = [
	'weapon',
	'armor',
	'artefact',
	'attachment',
	'bag',
	'boost',
	'bullet',
	'grenade',
] as const
export type BalanceCategory = (typeof balanceCategories)[number]
export type StatRegistry = Record<string, string>
export type BalanceRegistries = Partial<Record<BalanceCategory, StatRegistry>>
type Obj = Record<string, unknown>
const object = (v: unknown): Obj =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const key = (v: unknown) =>
	typeof object(v).key === 'string' ? (object(v).key as string) : ''
const localized = (v: unknown, lang: string) =>
	object(object(v).lines)[lang] ?? null
const weight = { 'core.tooltip.info.weight': 'Вес' }
export const defaultBalanceRegistries: Record<BalanceCategory, StatRegistry> = {
	weapon: {},
	artefact: {},
	attachment: { ...weight },
	bullet: { ...weight },
	armor: {
		...weight,
		...Object.fromEntries(
			Object.entries({
				max_weight_bonus: 'Переносимый вес',
				frost_protection: 'Защита от холода',
				bullet_dmg_factor: 'Пулестойкость',
				tear_dmg_factor: 'Защита от разрыва',
				explosion_dmg_factor: 'Защита от взрыва',
				electra_dmg_factor: 'Электрозащита',
				burn_dmg_factor: 'Защита от огня',
				chemical_burn_dmg_factor: 'Химзащита',
				radiation_protection: 'Защита от радиации',
				thermal_protection: 'Защита от температуры',
				biological_protection: 'Защита от биозаражения',
				psycho_protection: 'Защита от пси-излучения',
				bleeding_protection: 'Защита от кровотечения',
			}).map(([k, v]) => [`stalker.artefact_properties.factor.${k}`, v])
		),
	},
	bag: {
		...weight,
		'stalker.tooltip.backpack.stat_name.inner_protection':
			'Внутренняя защита',
		'stalker.tooltip.backpack.stat_name.effectiveness': 'Эффективность',
		'stalker.tooltip.backpack.info.size': 'Вместимость',
	},
	boost: {
		...weight,
		'stalker.tooltip.medicine.info.priority': 'Приоритет эффекта',
		'stalker.tooltip.medicine.info.duration': 'Время действия',
		'stalker.tooltip.medicine.info.toxicity': 'Отравление',
	},
	grenade: {
		...weight,
		...Object.fromEntries(
			Object.entries({
				explosion_strength: 'Урон в центре',
				explosion_strength_min: 'Минимальный урон',
				stopping_power: 'Останавливающее действие',
				lifetime: 'Время до взрыва',
				explosion_size: 'Радиус поражения',
			}).map(([k, v]) => [`weapon.grenade.frag.stats.info.${k}`, v])
		),
	},
}
export function balanceCategory(path: string): BalanceCategory | null {
	if (path.includes('/_variants/')) return null
	const match = path
		.replaceAll('\\', '/')
		.match(
			/(?:^|\/)items\/(armor|artefact|weapon|attachment|backpacks|container|drink|food|medicine|bullet|grenade)(?:\/|$)/
		)
	const value = match?.[1]
	return value === 'backpacks' || value === 'container'
		? 'bag'
		: value === 'drink' || value === 'food' || value === 'medicine'
			? 'boost'
			: ((value as BalanceCategory) ?? null)
}
const weaponNumeric: Record<string, string> = {
	'Скорость передвижения':
		'stalker.artefact_properties.factor.speed_modifier',
	Вес: 'core.tooltip.info.weight',
	Урон: 'core.tooltip.stat_name.damage_type.direct',
	Скорострельность: 'weapon.tooltip.weapon.info.rate_of_fire',
	'Размер магазина': 'weapon.tooltip.weapon.info.clip_size',
	Перезарядка: 'weapon.tooltip.magazine.info.reload_time',
	'Тактическая перезарядка':
		'weapon.tooltip.magazine.info.reload_time_tactical',
	'Макс. дистанция': 'weapon.tooltip.weapon.info.distance',
	Разброс: 'weapon.tooltip.weapon.info.spread',
	'Разброс от бедра': 'weapon.tooltip.weapon.info.hip_spread',
	'Вертикальная отдача': 'weapon.tooltip.weapon.info.recoil',
	'Горизонтальная отдача': 'weapon.tooltip.weapon.info.horizontal_recoil',
	Доставание: 'weapon.tooltip.weapon.info.draw_time',
	Прицеливание: 'weapon.tooltip.weapon.info.aim_switch',
	'Эргономика оружия': 'weapon.stat_factor.reload_modifier',
}
export function parseBalanceNumber(value: unknown) {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	if (typeof value !== 'string') return null
	const match = value
		.replaceAll('\u00a0', ' ')
		.replaceAll(',', '.')
		.match(/[-+]?\d*\.?\d+/)
	return match ? Number(match[0]) : null
}
function numericValue(element: Obj) {
	return element.type === 'numericVariants'
		? (list(element.value)[0] ?? null)
		: (element.value ?? null)
}
function textValue(element: Obj | undefined, lang: string, preferText = false) {
	if (!element) return null
	const value = object(element.value)
	return (preferText ? value.text : null) || localized(value, lang)
}
function itemName(data: Obj, lang: string) {
	return localized(data.name, lang)
}
function listElements(blocks: Obj[]) {
	return blocks
		.filter((block) => block.type === 'list')
		.flatMap((block) => list(block.elements).map(object))
}
function registryLabel(
	registry: StatRegistry,
	element: Obj,
	lang: string,
	allowKey = false
) {
	const rawKey = key(element.name) || (allowKey ? key(element.key) : '')
	if (!rawKey) return null
	registry[rawKey] ??= String(
		localized(element.name, lang) ?? (allowKey ? rawKey : 'Неизвестно')
	)
	return { rawKey, label: registry[rawKey] }
}

export function parseBalanceItem(
	input: unknown,
	category: BalanceCategory,
	lang = 'ru',
	registry: StatRegistry = { ...defaultBalanceRegistries[category] }
) {
	const data = object(input),
		blocks = list(data.infoBlocks).map(object),
		elements = listElements(blocks),
		result: Obj = { Название: itemName(data, lang) }
	const text = (
		target: string,
		preferText = category === 'attachment' || category === 'grenade'
	) =>
		textValue(
			elements.find(
				(element) =>
					element.type === 'key-value' && key(element.key) === target
			),
			lang,
			preferText
		)
	if (category === 'weapon') {
		result.Ранг = text('core.tooltip.info.rank')
		result.Категория = text('core.tooltip.info.category')
		result.Патрон = text('weapon.tooltip.weapon.info.ammo_type')
		for (const [label, target] of Object.entries(weaponNumeric)) {
			const element = elements.find(
				(item) =>
					(item.type === 'numeric' ||
						item.type === 'numericVariants') &&
					key(item.name) === target
			)
			result[label] = element ? numericValue(element) : null
		}
		for (const [label, pattern] of Object.entries({
			Перегрев: 'overheat_after',
			'Множитель в голову': 'head_damage_modifier',
			'Множитель по конечностям': 'limbs_damage_modifier',
		})) {
			const element = elements.find(
					(item) =>
						item.type === 'text' && key(item.text).includes(pattern)
				),
				args = object(object(element?.text).args)
			result[label] = parseBalanceNumber(args.modifier ?? args.value)
		}
		return result
	}
	if (category === 'artefact') {
		const rank = elements.find(
				(element) =>
					element.type === 'key-value' &&
					key(element.key) === 'core.tooltip.info.rank'
			),
			classValue = elements.find(
				(element) =>
					element.type === 'key-value' &&
					key(element.key) === 'core.tooltip.info.category'
			)
		const rankValue = object(rank?.value),
			classData = object(classValue?.value),
			rankCost = rankValue.args
				? parseBalanceNumber(object(rankValue.args).cost)
				: null,
			classCost = classData.args
				? parseBalanceNumber(object(classData.args).cost)
				: null,
			metadata: Obj = {
				Название: itemName(data, lang),
				Ранг: rankCost ?? localized(rankValue, lang),
				Класс: classCost ?? localized(classData, lang),
			}
		for (const element of blocks
			.filter(
				(block) => block.type === 'list' || block.type === 'addStat'
			)
			.flatMap((block) => list(block.elements).map(object))) {
			const type = String(element.type),
				entry = registryLabel(registry, element, lang, true)
			if (
				!entry ||
				!['numeric', 'numericVariants', 'range'].includes(type)
			)
				continue
			const min = parseBalanceNumber(
					type === 'range' ? element.min : numericValue(element)
				),
				max = parseBalanceNumber(
					type === 'range' ? element.max : numericValue(element)
				)
			if (min === null || max === null) continue
			const previous = object(metadata[entry.label])
			metadata[entry.label] = {
				min: Number(previous.min ?? 0) + min,
				max: Number(previous.max ?? 0) + max,
			}
		}
		for (const [label, value] of Object.entries(metadata))
			if (value === null) delete metadata[label]
		return metadata
	}
	if (category !== 'bullet') result.Ранг = text('core.tooltip.info.rank')
	result[category === 'armor' ? 'Категория' : 'Класс'] =
		category === 'bullet'
			? 'Патроны'
			: category === 'grenade'
				? 'Гранаты'
				: text('core.tooltip.info.category')
	if (category === 'attachment') result.compatibilityList = []
	if (category === 'bullet')
		result.bulletFlags = elements
			.filter((element) => element.type === 'text')
			.map((element) => localized(element.text, lang))
			.filter((value): value is string => Boolean(value))
	for (const element of elements) {
		if (
			category === 'attachment' &&
			element.type === 'key-value' &&
			key(element.key).toLowerCase().includes('zoom')
		) {
			const zoom = key(element.key)
			registry[zoom] ??= String(localized(element.key, lang) ?? zoom)
			result[registry[zoom]] = object(element.value).text ?? null
			continue
		}
		const type = String(element.type),
			entry = registryLabel(registry, element, lang, category === 'armor')
		if (!entry || !['numeric', 'numericVariants'].includes(type)) continue
		const value = numericValue(element)
		if (value !== null) result[entry.label] = value
	}
	return result
}
