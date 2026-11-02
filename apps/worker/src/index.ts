import { db } from '@bscp/database'
import { claim, enqueue, fail, finish, heartbeat } from './queue'

let stopped = false,
	child: ReturnType<typeof Bun.spawn> | null = null
process.on('SIGTERM', () => {
	stopped = true
	child?.kill()
})
process.on('SIGINT', () => {
	stopped = true
	child?.kill()
})
async function schedule() {
	if (process.env.SCHEDULER_ENABLED !== 'true') return
	const now = Date.now()
	for (const region of ['RU', 'GLOBAL']) {
		if (process.env[region === 'RU' ? 'AUTH_LINK' : 'GLOBAL_AUTH_LINK'])
			await enqueue(
				'PATCH',
				`schedule:patch:${region}:${Math.floor(now / 60000)}`,
				{ region }
			)
		await enqueue(
			'SERVERS',
			`schedule:servers:${region}:${Math.floor(now / 1800000)}`,
			{ region }
		)
	}
	await enqueue('BALANCE', `schedule:balance:${Math.floor(now / 300000)}`, {})
	if (process.env.RENDER_SCHEDULED === 'true')
		await enqueue(
			'RENDER',
			`schedule:render:${Math.floor(now / 3600000)}`,
			{}
		)
}
try {
	while (!stopped) {
		await schedule()
		const job = await claim()
		if (!job) {
			await Bun.sleep(2000)
			continue
		}
		const task = Bun.spawn(
			[
				process.execPath,
				new URL('./task.ts', import.meta.url).pathname,
				job.id,
			],
			{ stdout: 'pipe', stderr: 'pipe', env: process.env }
		)
		child = task
		let cancelled = false,
			timedOut = false
		const pulse = setInterval(() => {
			void (async () => {
				const row = await heartbeat(job.id)
				if (!row) {
					cancelled = true
					task.kill()
				}
			})().catch(() => {
				task.kill()
			})
		}, 15000)
		const timeout = setTimeout(() => {
			timedOut = true
			task.kill()
		}, 300000)
		const output = new Response(task.stdout).text(),
			errors = new Response(task.stderr).text()
		try {
			const code = await task.exited
			const text = await output
			await errors
			if (code === 0 && !cancelled && !timedOut)
				await finish(job.id, JSON.parse(text))
			else await fail(job.id, job.attempts, cancelled)
		} catch {
			await fail(job.id, job.attempts, cancelled)
		} finally {
			clearInterval(pulse)
			clearTimeout(timeout)
			child = null
		}
	}
} finally {
	await db.close()
}
