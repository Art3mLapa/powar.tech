import { z } from 'zod'

export const roleSchema = z.enum(['OWNER', 'ADMIN', 'AUTHOR'])
export type Role = z.infer<typeof roleSchema>
export const usernameSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3)
	.max(32)
	.regex(/^[a-z0-9][a-z0-9_-]*$/)
export const passwordSchema = z.string().min(12).max(128)
export const registerSchema = z
	.object({
		token: z.string().trim().min(32).max(128),
		username: usernameSchema,
		password: passwordSchema,
	})
	.strict()
export const loginSchema = z
	.object({ username: usernameSchema, password: z.string().max(128) })
	.strict()
export const factorSchema = z.object({
	challenge: z.string().min(32).max(128),
	code: z.string().min(6).max(40),
})
export const inviteSchema = z
	.object({ username: usernameSchema, role: z.enum(['ADMIN', 'AUTHOR']) })
	.strict()
export const articleSchema = z.object({
	title: z.string().trim().min(1).max(180),
	content: z.string().max(200_000),
	excerpt: z.string().max(400).default(''),
	tags: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
	slug: z
		.string()
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.max(180),
	version: z.number().int().positive(),
	coverId: z.uuid().nullable().optional(),
})
export const pageSchema = z.object({
	page: z.coerce.number().int().min(1).max(100000).default(1),
	search: z.string().max(120).default(''),
})
export type ArticleInput = z.infer<typeof articleSchema>
export type Account = { id: number; username: string; role: string }
export type Article = {
	id: number
	title: string
	content: string | null
	slug: string | null
	excerpt: string
	tags: string[]
	status: string
	version: number
	authorId: number
	publishedAt: string | null
	createdAt: string
	updatedAt: string
	reviewNote: string | null
	coverId: string | null
}
