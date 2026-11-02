import { expect, test } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'

const database = process.env.TEST_DATABASE_URL

const usernameFor = (prefix: string) =>
	`${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 19)}`

test.skipIf(!database)(
	'invitation, mandatory TOTP, recovery, session and CSRF',
	{ timeout: 30_000 },
	async () => {
		process.env.DATABASE_URL = database
		process.env.TOTP_ENCRYPTION_KEY = 'ab'.repeat(32)
		process.env.WEB_ORIGIN = 'http://localhost:3000'
		process.env.NODE_ENV = 'test'
		const storageDir = `/tmp/bscp-backend-test-${crypto.randomUUID()}`
		process.env.STORAGE_DIR = storageDir
		const { createApp } = await import('../src/app')
		const { invite } = await import('../src/app/api/auth/auth.service')
		const { totp } = await import('../src/lib/crypto')
		const { db } = await import('@bscp/database')
		const app = createApp()
		const username = usernameFor('integration')
		const invitation = await invite(username, 'AUTHOR', null)
		const inviteToken =
			new URLSearchParams(new URL(invitation.url).hash.slice(1)).get(
				'token'
			) ?? ''
		const call = (
			path: string,
			body?: unknown,
			cookie?: string,
			origin = 'http://localhost:3000'
		) =>
			app.handle(
				new Request(`http://localhost/api/v1${path}`, {
					method: body === undefined ? 'GET' : 'POST',
					headers: {
						origin,
						'content-type': 'application/json',
						...(cookie ? { cookie } : {}),
					},
					...(body === undefined
						? {}
						: { body: JSON.stringify(body) }),
				})
			)
		try {
			const denied = await call(
				'/auth/register',
				{
					token: inviteToken,
					email: 'legacy@example.test',
					password: 'a-strong-password-123',
					name: 'Тест',
				},
				undefined,
				'https://evil.test'
			)
			expect(denied.status).toBe(403)
			expect(
				(
					await call('/auth/register', {
						token: inviteToken,
						email: 'legacy@example.test',
						password: 'a-strong-password-123',
						name: 'Тест',
					})
				).status
			).toBe(422)
			const response = await call('/auth/register', {
				token: inviteToken,
				username: username.toUpperCase(),
				password: 'a-strong-password-123',
			})
			expect(response.status).toBe(200)
			expect(response.headers.get('set-cookie')).toBeNull()
			const enrollment = await response.json()
			expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/)
			const enrollmentUri = new URL(enrollment.uri)
			expect(enrollmentUri.searchParams.get('issuer')).toBe('bscp')
			expect(decodeURIComponent(enrollmentUri.pathname.slice(1))).toBe(
				`bscp:${username}`
			)
			expect((await call('/auth/me')).status).toBe(401)
			const code = totp(enrollment.secret, Math.floor(Date.now() / 30000))
			const verified = await call('/auth/factor', {
				challenge: enrollment.challenge,
				code,
			})
			expect(verified.status).toBe(200)
			const verifiedBody = await verified.json()
			expect(verifiedBody.user).toEqual({
				id: expect.any(Number),
				username,
				role: 'AUTHOR',
			})
			expect(verifiedBody.recoveryCodes).toHaveLength(10)
			const cookie =
				verified.headers.get('set-cookie')?.split(';')[0] ?? ''
			expect(cookie.startsWith('bscp_session=')).toBe(true)
			expect((await call('/auth/me', undefined, cookie)).status).toBe(200)
			expect(
				(
					await call('/auth/factor', {
						challenge: enrollment.challenge,
						code,
					})
				).status
			).toBe(401)
			expect(
				(
					await call('/auth/register', {
						token: inviteToken,
						username,
						password: 'a-strong-password-123',
					})
				).status
			).toBe(400)
			const raceUsername = usernameFor('race')
			const raceInvitation = await invite(raceUsername, 'AUTHOR', null)
			const raceToken =
				new URLSearchParams(
					new URL(raceInvitation.url).hash.slice(1)
				).get('token') ?? ''
			const raceBody = {
				token: raceToken,
				username: raceUsername.toUpperCase(),
				password: 'a-strong-password-123',
			}
			const raceResponses = await Promise.all([
				call('/auth/register', raceBody),
				call('/auth/register', raceBody),
			])
			const raceStatuses = raceResponses.map(
				(response) => response.status
			)
			expect(
				raceStatuses.filter((status) => status === 200)
			).toHaveLength(1)
			expect(
				raceStatuses.filter(
					(status) => status === 400 || status === 409
				)
			).toHaveLength(1)
			const raceUsers = await db.orm.public.User.where({
				username: raceUsername,
			}).all()
			expect(raceUsers).toHaveLength(1)
			const raceUser = raceUsers[0]!
			expect(raceUser.totpEnabled).toBe(false)
			expect(
				await db.orm.public.Session.where({ userId: raceUser.id }).all()
			).toHaveLength(0)
			const login = await (
				await call('/auth/login', {
					username: username.toUpperCase(),
					password: 'a-strong-password-123',
				})
			).json()
			expect(
				(
					await call('/auth/factor', {
						challenge: login.challenge,
						code,
					})
				).status
			).toBe(401)
			const recovered = await call('/auth/factor', {
				challenge: login.challenge,
				code: verifiedBody.recoveryCodes[0],
			})
			expect(recovered.status).toBe(200)
			const again = await (
				await call('/auth/login', {
					username,
					password: 'a-strong-password-123',
				})
			).json()
			expect(
				(
					await call('/auth/factor', {
						challenge: again.challenge,
						code: verifiedBody.recoveryCodes[0],
					})
				).status
			).toBe(401)
			expect(
				(
					await call(
						'/auth/invitations',
						{ username: usernameFor('other'), role: 'ADMIN' },
						cookie
					)
				).status
			).toBe(403)
			const draftResponse = await call('/articles', {}, cookie)
			expect(draftResponse.status).toBe(200)
			const draft = await draftResponse.json()
			const update = async (version: number) =>
				app.handle(
					new Request(
						`http://localhost/api/v1/articles/${draft.id}`,
						{
							method: 'PUT',
							headers: {
								origin: 'http://localhost:3000',
								'content-type': 'application/json',
								cookie,
							},
							body: JSON.stringify({
								title: 'Проверка публикации',
								slug: `test-${crypto.randomUUID()}`,
								content: '## Тест\n\nТекст статьи',
								excerpt: 'Описание',
								tags: ['тест'],
								version,
							}),
						}
					)
				)
			const saved = await update(draft.version)
			expect(saved.status).toBe(200)
			const article = await saved.json()
			const foreignAssetId = crypto.randomUUID()
			await db.orm.public.StoredAsset.create({
				id: foreignAssetId,
				storageKey: `foreign-${crypto.randomUUID()}.webp`,
				mime: 'image/webp',
				size: 1n,
				originalName: 'foreign.webp',
				postId: null,
			})
			const coverAttempt = await app.handle(
				new Request(`http://localhost/api/v1/articles/${draft.id}`, {
					method: 'PUT',
					headers: {
						origin: 'http://localhost:3000',
						'content-type': 'application/json',
						cookie,
					},
					body: JSON.stringify({
						title: 'Проверка публикации',
						slug: article.slug,
						content: '## Тест\\n\\nТекст статьи',
						excerpt: 'Описание',
						tags: ['тест'],
						version: article.version,
						coverId: foreignAssetId,
					}),
				})
			)
			expect(coverAttempt.status).toBe(422)
			const mediaDigest = 'b'.repeat(64)
			const mediaKey = `${draft.id}-${mediaDigest}.webp`
			await mkdir(storageDir, { recursive: true })
			await Bun.write(
				`${storageDir}/${mediaKey}`,
				new Uint8Array([1, 2, 3])
			)
			const media = await db.orm.public.StoredAsset.create({
				id: crypto.randomUUID(),
				storageKey: mediaKey,
				mime: 'image/webp',
				size: 3n,
				originalName: 'cover.webp',
				postId: draft.id,
			})
			expect((await call(`/articles/media/${media.id}`)).status).toBe(401)
			expect(
				(await call(`/articles/media/${media.id}`, undefined, cookie))
					.status
			).toBe(200)
			expect((await update(draft.version)).status).toBe(409)
			expect(
				(await call(`/articles/public/${article.slug}`)).status
			).toBe(404)
			expect(
				(
					await call(
						`/articles/${draft.id}/status`,
						{ action: 'publish', version: article.version },
						cookie
					)
				).status
			).toBe(403)
			const reviewed = await (
				await call(
					`/articles/${draft.id}/status`,
					{ action: 'submit', version: article.version },
					cookie
				)
			).json()
			await db.orm.public.User.where({ username }).update({
				role: 'ADMIN',
			})
			const publishedResponse = await call(
				`/articles/${draft.id}/status`,
				{ action: 'publish', version: reviewed.version },
				cookie
			)
			expect(publishedResponse.status).toBe(200)
			expect(
				(await call(`/articles/public/${article.slug}`)).status
			).toBe(200)
			expect(
				(await call(`/articles/${draft.id}/image`, {}, cookie)).status
			).toBe(409)
			expect((await call(`/articles/media/${media.id}`)).status).toBe(200)
			const foreignUser = await db.orm.public.User.create({
				username: usernameFor('foreign'),
				totpEnabled: true,
			})
			const foreignSession = crypto
				.randomUUID()
				.replaceAll('-', '')
				.repeat(2)
			const { hash } = await import('../src/lib/crypto')
			await db.orm.public.Session.create({
				id: hash(foreignSession),
				userId: foreignUser.id,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
			})
			expect(
				(
					await call(
						`/articles/${draft.id}`,
						undefined,
						`bscp_session=${foreignSession}`
					)
				).status
			).toBe(403)
			const pendingInvite = await invite(
				usernameFor('revoke'),
				'AUTHOR',
				null
			)
			const pendingToken =
				new URLSearchParams(
					new URL(pendingInvite.url).hash.slice(1)
				).get('token') ?? ''
			const pendingRow = await db.orm.public.Invitation.first({
				tokenHash: hash(pendingToken),
			})
			if (!pendingRow)
				throw new Error('Pending invitation was not created')
			const revoke = await app.handle(
				new Request(
					`http://localhost/api/v1/admin/invitations/${pendingRow.id}`,
					{
						method: 'DELETE',
						headers: { origin: 'http://localhost:3000', cookie },
					}
				)
			)
			expect(revoke.status).toBe(200)
			expect(
				await db.orm.public.Invitation.first({ id: pendingRow.id })
			).toBeNull()
			const { publicData } = await import('../src/lib/jobs')
			expect(
				publicData({
					authLinks: ['secret'],
					sourceUrl: 'https://private.test',
					url: 'https://private.test',
					path: 'public/path',
				})
			).toEqual({ path: 'public/path' })
			await call('/auth/logout-all', {}, cookie)
			expect((await call('/auth/me', undefined, cookie)).status).toBe(401)
		} finally {
			await db.close()
			await rm(storageDir, { recursive: true, force: true })
		}
	}
)
