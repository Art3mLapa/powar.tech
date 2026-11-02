import { db } from '@bscp/database'
import { createApp } from './app'
import { env } from './env'

const app = createApp().listen(env.PORT)
console.info(`Backend listening on port ${env.PORT}`)
async function shutdown() {
	await app.stop()
	await db.close()
	process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
