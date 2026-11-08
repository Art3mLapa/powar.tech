#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/698d652dad70ac2a2faa3e6a82941cf582694b883f1aea3e45ba6bceb4bb0a7a/contract';
import startContract from '../../snapshots/698d652dad70ac2a2faa3e6a82941cf582694b883f1aea3e45ba6bceb4bb0a7a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7c0301921c004bb0abcc2d21bc5b2d037566e5de041672b11302c3e5436adeb4/contract';
import endContract from '../../snapshots/7c0301921c004bb0abcc2d21bc5b2d037566e5de041672b11302c3e5436adeb4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'StoredAsset',
        column: col('description', 'text', {
          notNull: true,
          default: lit(''),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
