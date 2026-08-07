import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

/**
 * [CORE] Kysely — spec §2.3: query builder type-safe cho BÁO CÁO.
 * LUẬT §4.9: Kysely CHỈ ĐỌC. Ghi bằng Kysely không đi qua audit extension —
 * bị cấm. Interface DB khai TỐI THIỂU những cột báo cáo dùng.
 */
export interface ReportDatabase {
  orders: {
    id: string;
    tenant_id: string;
    code: string;
    customer_id: string;
    status: string;
    subtotal: string;
    total: string;
    margin: string | null;
    created_by_id: string | null;
    org_unit_id: string | null;
    created_at: Date;
    approved_at: Date | null;
    deleted_at: Date | null;
  };
  customers: {
    id: string;
    tenant_id: string;
    code: string;
    name: unknown; // jsonb
    deleted_at: Date | null;
  };
}

@Injectable()
export class KyselyService implements OnModuleDestroy {
  readonly db: Kysely<ReportDatabase>;
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 5, // báo cáo — pool riêng, không tranh connection với OLTP
    });
    this.db = new Kysely<ReportDatabase>({
      dialect: new PostgresDialect({ pool: this.pool }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
