import { passwordSchema, usernameSchema } from '@bscp/contracts'
import { db } from '@bscp/database'
import { invite } from './app/api/auth/auth.service'
import { recoverOwner, renewOwnerInvitation } from './lib/owner-recovery'

const [command, usernameInput] = process.argv.slice(2)
try {
	if (
		!['invite-owner', 'renew-owner-invitation', 'recover-owner'].includes(
			command
		)
	)
		throw new Error(
			'Использование: bun apps/backend/src/cli.ts invite-owner|renew-owner-invitation|recover-owner username'
		)
	const username = usernameSchema.parse(usernameInput)
	if (command === 'recover-owner') {
		if (process.stdin.isTTY)
			throw new Error(
				'Передайте новый пароль через stdin; не указывайте его в аргументах команды.'
			)
		const password = passwordSchema.parse(
			(await Bun.stdin.text()).replace(/\r?\n$/, '')
		)
		const result = await recoverOwner(username, password)
		console.info(
			`Все сессии отозваны. Добавьте НОВЫЙ ключ в аутентификатор:\n${result.secret}\nПодтвердите код в течение 30 минут:\n${result.url}`
		)
	} else {
		const result =
			command === 'invite-owner'
				? await invite(username, 'OWNER', null)
				: await renewOwnerInvitation(username)
		console.info(`Одноразовая ссылка (24 часа):\n${result.url}`)
	}
} finally {
	await db.close()
}
