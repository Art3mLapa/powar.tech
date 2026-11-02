#!/usr/bin/env -S node
import {
	col,
	fn,
	lit,
	Migration,
	MigrationCLI,
	primaryKey,
	sql,
} from '@prisma/orm-postgres/migration'
import type { Contract as End } from '../../snapshots/58a56a8c4cc28d3a20eb6932d5266f3b3aaa5e08f59db566e3eda3511bc3786f/contract'
import endContract from '../../snapshots/58a56a8c4cc28d3a20eb6932d5266f3b3aaa5e08f59db566e3eda3511bc3786f/contract.json' with {
	type: 'json',
}
import type { Contract as Start } from '../../snapshots/a51b4833fdaffe730572670ccc27dd89af7e0726ab3de7f428d21702d687cc15/contract'
import startContract from '../../snapshots/a51b4833fdaffe730572670ccc27dd89af7e0726ab3de7f428d21702d687cc15/contract.json' with {
	type: 'json',
}

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract
	override readonly endContractJson = endContract

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'AuditEvent',
				columns: [
					col('action', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('actorId', 'int4', {
						codecRef: { codecId: 'pg/int4@1' },
					}),
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('subject', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'AuthChallenge',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('expiresAt', 'timestamptz', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('kind', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('userId', 'int4', {
						notNull: true,
						codecRef: { codecId: 'pg/int4@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'DataSnapshot',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('data', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('kind', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('previousId', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('region', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('sourceHash', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'GameChange',
				columns: [
					col('category', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('kind', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('newValue', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('oldValue', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('path', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('snapshotId', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'GameFile',
				columns: [
					col('category', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('hash', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('path', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('size', 'int8', {
						notNull: true,
						codecRef: { codecId: 'pg/int8@1' },
					}),
					col('snapshotId', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('url', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'GameSnapshot',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('manifestHash', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('previousId', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('region', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'Invitation',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('email', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('expiresAt', 'timestamptz', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('ownerSlot', 'int4', {
						codecRef: { codecId: 'pg/int4@1' },
					}),
					col('role', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('tokenHash', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('usedAt', 'timestamptz', {
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'Job',
				columns: [
					col('attempts', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' },
					}),
					col('availableAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('dedupeKey', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('error', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('kind', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('leaseOwner', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('leaseUntil', 'timestamptz', {
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('payload', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('progress', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' },
					}),
					col('result', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('state', 'text', {
						notNull: true,
						default: lit('QUEUED'),
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('updatedAt', 'timestamptz', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'PostRevision',
				columns: [
					col('content', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('postId', 'int4', {
						notNull: true,
						codecRef: { codecId: 'pg/int4@1' },
					}),
					col('title', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('version', 'int4', {
						notNull: true,
						codecRef: { codecId: 'pg/int4@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'RateLimit',
				columns: [
					col('attempts', 'int4', {
						notNull: true,
						default: lit(0),
						codecRef: { codecId: 'pg/int4@1' },
					}),
					col('expiresAt', 'timestamptz', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'RecoveryCode',
				columns: [
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('userId', 'int4', {
						notNull: true,
						codecRef: { codecId: 'pg/int4@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'ServerSample',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('data', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('region', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'Session',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('expiresAt', 'timestamptz', {
						notNull: true,
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('userId', 'int4', {
						notNull: true,
						codecRef: { codecId: 'pg/int4@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'StoredAsset',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn(sql`now()`),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('mime', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('originalName', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('postId', 'int4', {
						codecRef: { codecId: 'pg/int4@1' },
					}),
					col('public', 'bool', {
						notNull: true,
						default: lit(false),
						codecRef: { codecId: 'pg/bool@1' },
					}),
					col('size', 'int8', {
						notNull: true,
						codecRef: { codecId: 'pg/int8@1' },
					}),
					col('snapshotId', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('storageKey', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('coverId', 'text', {
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('excerpt', 'text', {
					notNull: true,
					default: lit(''),
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('publishedAt', 'timestamptz', {
					codecRef: { codecId: 'pg/timestamptz-string@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('reviewNote', 'text', {
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('slug', 'text', {
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('status', 'text', {
					notNull: true,
					default: lit('DRAFT'),
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('tags', 'text[]', {
					notNull: true,
					default: lit([]),
					codecRef: { codecId: 'pg/text@1', many: true },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'Post',
				column: col('version', 'int4', {
					notNull: true,
					default: lit(1),
					codecRef: { codecId: 'pg/int4@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'User',
				column: col('disabled', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'User',
				column: col('lastTotpStep', 'int8', {
					notNull: true,
					default: lit('-1'),
					codecRef: { codecId: 'pg/int8@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'User',
				column: col('passwordHash', 'text', {
					notNull: true,
					default: lit(''),
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'User',
				column: col('role', 'text', {
					notNull: true,
					default: lit('AUTHOR'),
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'User',
				column: col('totpEnabled', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' },
				}),
			}),
			this.addColumn({
				schema: 'public',
				table: 'User',
				column: col('totpSecret', 'text', {
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.addUnique({
				schema: 'public',
				table: 'DataSnapshot',
				constraint: 'DataSnapshot_kind_region_sourceHash_key',
				columns: ['kind', 'region', 'sourceHash'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'GameFile',
				constraint: 'GameFile_snapshotId_path_key',
				columns: ['snapshotId', 'path'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'GameSnapshot',
				constraint: 'GameSnapshot_region_manifestHash_key',
				columns: ['region', 'manifestHash'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'Invitation',
				constraint: 'Invitation_tokenHash_key',
				columns: ['tokenHash'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'Invitation',
				constraint: 'Invitation_email_key',
				columns: ['email'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'Invitation',
				constraint: 'Invitation_ownerSlot_key',
				columns: ['ownerSlot'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'Job',
				constraint: 'Job_dedupeKey_key',
				columns: ['dedupeKey'],
			}),
			this.addCheckConstraint({
				schema: 'public',
				table: 'Post',
				constraint: 'Post_tags_elem_not_null_aecbe9e2',
				expression: sql`array_position("tags", NULL) IS NULL`,
			}),
			this.addUnique({
				schema: 'public',
				table: 'Post',
				constraint: 'Post_slug_key',
				columns: ['slug'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'PostRevision',
				constraint: 'PostRevision_postId_version_key',
				columns: ['postId', 'version'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'StoredAsset',
				constraint: 'StoredAsset_storageKey_key',
				columns: ['storageKey'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'User',
				constraint: 'User_username_key',
				columns: ['username'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'AuditEvent',
				index: 'AuditEvent_createdAt_idx_9575dbd7',
				columns: ['createdAt'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'AuthChallenge',
				index: 'AuthChallenge_userId_idx_a489d58a',
				columns: ['userId'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'GameChange',
				index: 'GameChange_snapshotId_category_idx_5634cac0',
				columns: ['snapshotId', 'category'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'GameChange',
				index: 'GameChange_snapshotId_idx_e639e2e6',
				columns: ['snapshotId'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'GameFile',
				index: 'GameFile_hash_idx_d25bc543',
				columns: ['hash'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'GameFile',
				index: 'GameFile_snapshotId_idx_e639e2e6',
				columns: ['snapshotId'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'GameSnapshot',
				index: 'GameSnapshot_region_createdAt_idx_81625bad',
				columns: ['region', 'createdAt'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'Job',
				index: 'Job_state_availableAt_idx_a2748d5f',
				columns: ['state', 'availableAt'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'Post',
				index: 'Post_status_publishedAt_idx_4d4b1960',
				columns: ['status', 'publishedAt'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'PostRevision',
				index: 'PostRevision_postId_idx_a7a72715',
				columns: ['postId'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'RecoveryCode',
				index: 'RecoveryCode_userId_idx_a489d58a',
				columns: ['userId'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'ServerSample',
				index: 'ServerSample_region_createdAt_idx_81625bad',
				columns: ['region', 'createdAt'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'Session',
				index: 'Session_expiresAt_idx_6b6b8c10',
				columns: ['expiresAt'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'Session',
				index: 'Session_userId_idx_a489d58a',
				columns: ['userId'],
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'AuthChallenge',
				foreignKey: {
					name: 'AuthChallenge_userId_fkey',
					columns: ['userId'],
					references: {
						schema: 'public',
						table: 'User',
						columns: ['id'],
					},
				},
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GameChange',
				foreignKey: {
					name: 'GameChange_snapshotId_fkey',
					columns: ['snapshotId'],
					references: {
						schema: 'public',
						table: 'GameSnapshot',
						columns: ['id'],
					},
				},
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'GameFile',
				foreignKey: {
					name: 'GameFile_snapshotId_fkey',
					columns: ['snapshotId'],
					references: {
						schema: 'public',
						table: 'GameSnapshot',
						columns: ['id'],
					},
				},
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'PostRevision',
				foreignKey: {
					name: 'PostRevision_postId_fkey',
					columns: ['postId'],
					references: {
						schema: 'public',
						table: 'Post',
						columns: ['id'],
					},
				},
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'RecoveryCode',
				foreignKey: {
					name: 'RecoveryCode_userId_fkey',
					columns: ['userId'],
					references: {
						schema: 'public',
						table: 'User',
						columns: ['id'],
					},
				},
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'Session',
				foreignKey: {
					name: 'Session_userId_fkey',
					columns: ['userId'],
					references: {
						schema: 'public',
						table: 'User',
						columns: ['id'],
					},
				},
			}),
		]
	}
}

MigrationCLI.run(import.meta.url, M)
