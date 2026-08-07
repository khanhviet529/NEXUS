'use client';

import { Suspense, useMemo, useState } from 'react';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { customersControllerList } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableMeta } from '@/components/common/data-table';
import { useCan } from '@/lib/auth/use-can';
import { CustomerFormDialog } from '@/features/customers/customer-form';

interface CustomerRow {
  id: string;
  code: string;
  name: string | null;
  taxCode: string | null;
  version: number;
  createdAt: string;
}

/**
 * Trang customers — [REF] DataTable §5.5 + Form §5.8 ghép nhau:
 * URL là nguồn sự thật (§5.4), tạo mới qua dialog form chuẩn.
 */
function CustomersPage() {
  const can = useCan();
  const [openForm, setOpenForm] = useState(false);
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
  });

  const customers = useQuery({
    queryKey: ['customers', params],
    queryFn: () =>
      customersControllerList({ page: params.page, limit: params.limit }) as unknown as Promise<{
        data: CustomerRow[];
        meta: DataTableMeta;
      }>,
    placeholderData: (prev) => prev,
  });

  const columns = useMemo<ColumnDef<CustomerRow, unknown>[]>(
    () => [
      { id: 'code', header: 'Mã KH', cell: ({ row }) => <span className="font-mono">{row.original.code}</span> },
      { id: 'name', header: 'Tên khách hàng', cell: ({ row }) => row.original.name ?? '—' },
      { id: 'taxCode', header: 'Mã số thuế', cell: ({ row }) => row.original.taxCode ?? '—' },
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('vi-VN'),
      },
    ],
    [],
  );

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Khách hàng</h1>
        {can('customer:create') && (
          <Button onClick={() => setOpenForm(true)}>
            <Plus /> Tạo khách hàng
          </Button>
        )}
      </header>

      <DataTable
        tableKey="customers"
        columns={columns}
        rows={customers.data?.data ?? []}
        meta={customers.data?.meta}
        state={params}
        onStateChange={(patch) => void setParams({ ...params, ...patch })}
        status={customers.status}
        onRetry={() => void customers.refetch()}
        getRowId={(r) => r.id}
        emptyCta={
          can('customer:create') ? (
            <Button size="sm" onClick={() => setOpenForm(true)}>
              <Plus /> Tạo khách hàng đầu tiên
            </Button>
          ) : undefined
        }
      />

      <CustomerFormDialog open={openForm} onOpenChange={setOpenForm} />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CustomersPage />
    </Suspense>
  );
}
