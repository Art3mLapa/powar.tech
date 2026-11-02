#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from '@prisma/orm-postgres/migration'
import postgres from '@prisma/orm-postgres/runtime'
import { contractFromJson } from '@prisma/orm-postgres/static'
import type { Contract as Start } from '../../snapshots/58a56a8c4cc28d3a20eb6932d5266f3b3aaa5e08f59db566e3eda3511bc3786f/contract'
import startContract from '../../snapshots/58a56a8c4cc28d3a20eb6932d5266f3b3aaa5e08f59db566e3eda3511bc3786f/contract.json' with {
	type: 'json',
}
import type { Contract as End } from '../../snapshots/698d652dad70ac2a2faa3e6a82941cf582694b883f1aea3e45ba6bceb4bb0a7a/contract'
import endContract from '../../snapshots/698d652dad70ac2a2faa3e6a82941cf582694b883f1aea3e45ba6bceb4bb0a7a/contract.json' with {
	type: 'json',
}

const end = contractFromJson<End>(endContract)
const { raw } = postgres({ contract: end })

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract
	override readonly endContractJson = endContract

	override get operations() {
		return [
			this.dropConstraint({
				schema: 'public',
				table: 'Invitation',
				constraint: 'Invitation_email_key',
			}),
			this.dropConstraint({
				schema: 'public',
				table: 'User',
				constraint: 'User_email_key',
			}),
			this.dropConstraint({
				schema: 'public',
				table: 'User',
				constraint: 'User_username_key',
			}),
			this.addColumn({
				schema: 'public',
				table: 'Invitation',
				column: col('username', 'text', {
					codecRef: { codecId: 'pg/text@1' },
				}),
			}),
			this.dataTransform(end, 'normalize-User-username', {
				backfillsColumn: {
					schema: 'public',
					table: 'User',
					column: 'username',
				},
				check: () =>
					raw.sql`SELECT "id" FROM "public"."User" WHERE "username" IS NULL OR btrim("username") !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' OR "username" <> lower(btrim("username")) LIMIT 1`
						.returnsRow({ id: 'pg/int4@1' })
						.build(),
				run: () =>
					raw.sql`DO $$
DECLARE
  row_data RECORD;
  candidate TEXT;
  base TEXT;
  suffix INTEGER;
BEGIN
  CREATE TEMP TABLE bscp_user_username_source ON COMMIT DROP AS
    SELECT "id", "username", "email" FROM "public"."User";
  UPDATE "public"."User" SET "username" = NULL;
  FOR row_data IN SELECT * FROM bscp_user_username_source ORDER BY "id" LOOP
    candidate := lower(btrim(row_data."username"));
    IF candidate IS NULL OR candidate !~ '^[a-z0-9][a-z0-9_-]{2,31}$' OR EXISTS (
      SELECT 1 FROM "public"."User" WHERE "username" = candidate
    ) THEN
      base := 'user_' || row_data."id"::TEXT;
      candidate := base;
      suffix := 2;
      WHILE EXISTS (SELECT 1 FROM "public"."User" WHERE "username" = candidate) LOOP
        candidate := left(base, 32 - length('_' || suffix::TEXT)) || '_' || suffix::TEXT;
        suffix := suffix + 1;
      END LOOP;
    END IF;
    UPDATE "public"."User" SET "username" = candidate WHERE "id" = row_data."id";
  END LOOP;
END $$`
						.affectedCount()
						.build(),
			}),
			this.setNotNull({
				schema: 'public',
				table: 'User',
				column: 'username',
			}),
			this.dataTransform(end, 'backfill-Invitation-username', {
				backfillsColumn: {
					schema: 'public',
					table: 'Invitation',
					column: 'username',
				},
				check: () =>
					raw.sql`SELECT "id" FROM "public"."Invitation" WHERE "username" IS NULL LIMIT 1`
						.returnsRow({ id: 'pg/text@1' })
						.build(),
				run: () =>
					raw.sql`DO $$
DECLARE
  row_data RECORD;
  candidate TEXT;
  base TEXT;
  suffix INTEGER;
BEGIN
  UPDATE "public"."Invitation" invitation
  SET "username" = user_row."username"
  FROM "public"."User" user_row
  WHERE invitation."usedAt" IS NOT NULL
    AND invitation."email" = user_row."email";
  FOR row_data IN
    SELECT "id" FROM "public"."Invitation" WHERE "username" IS NULL ORDER BY "id"
  LOOP
    base := 'invite_' || left(replace(row_data."id", '-', ''), 25);
    candidate := base;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM "public"."Invitation" WHERE "username" = candidate) LOOP
      candidate := left(base, 32 - length('_' || suffix::TEXT)) || '_' || suffix::TEXT;
      suffix := suffix + 1;
    END LOOP;
    UPDATE "public"."Invitation" SET "username" = candidate WHERE "id" = row_data."id";
  END LOOP;
END $$`
						.affectedCount()
						.build(),
			}),
			this.dataTransform(end, 'rewrite-AuditEvent-subjects', {
				check: () =>
					raw.sql`SELECT audit."id"
FROM "public"."AuditEvent" audit
WHERE EXISTS (
  SELECT 1 FROM (
    SELECT "email" AS subject, "username" FROM "public"."User"
    UNION ALL
    SELECT "email" AS subject, "username" FROM "public"."Invitation"
  ) candidates
  WHERE candidates.subject = audit."subject"
  GROUP BY candidates.subject
  HAVING count(DISTINCT candidates."username") = 1
) LIMIT 1`
						.returnsRow({ id: 'pg/text@1' })
						.build(),
				run: () =>
					raw.sql`WITH candidates AS (
  SELECT "email" AS subject, "username" FROM "public"."User"
  UNION ALL
  SELECT "email" AS subject, "username" FROM "public"."Invitation"
), unique_candidates AS (
  SELECT subject, min("username") AS username
  FROM candidates
  GROUP BY subject
  HAVING count(DISTINCT "username") = 1
)
UPDATE "public"."AuditEvent" audit
SET "subject" = unique_candidates.username
FROM unique_candidates
WHERE audit."subject" = unique_candidates.subject`
						.affectedCount()
						.build(),
			}),
			this.setNotNull({
				schema: 'public',
				table: 'Invitation',
				column: 'username',
			}),
			this.dropColumn({
				schema: 'public',
				table: 'Invitation',
				column: 'email',
			}),
			this.dropColumn({
				schema: 'public',
				table: 'User',
				column: 'name',
			}),
			this.dropColumn({
				schema: 'public',
				table: 'User',
				column: 'email',
			}),
			this.addUnique({
				schema: 'public',
				table: 'User',
				constraint: 'User_username_key',
				columns: ['username'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'Invitation',
				constraint: 'Invitation_username_key',
				columns: ['username'],
			}),
		]
	}
}

MigrationCLI.run(import.meta.url, M)
