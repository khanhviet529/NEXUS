'use client';

import { Suspense, useMemo } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { productsControllerList } from '@nexus/api-client';
import type { ProductResponseDto } from '@nexus/api-client';
import { DataTable } from '@/components/common/data-table';
import { Input } from '@/components/ui/input';

/**
 * V10 — trang products SINH TỪ `pnpm gen:module-fe product` (dogfood
 * generator GĐ9), rồi nâng theo đúng CHECKLIST generator in ra:
 * bước 1 thay apiAxios bằng hook sinh tự động + bước 2 cột theo DTO thật.
 *
 * URL là nguồn sự thật (§5.4): page/limit/sort/q sống trong query string.
 * costPrice có mặt HAY KHÔNG do BE quyết theo field:cost (§4.4c) — FE chỉ
 * hiện cột khi dữ liệu có, không tự hỏi quyền.
 */
function ProductsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    sort: parseAsString.withDefault('-createdAt'),
    q: parseAsString.withDefault(''),
  });

  const query = useQuery({
    queryKey: ['products', params],
    queryFn: () =>
      productsControllerList({
        page: params.page,
        limit: params.limit,
        sort: params.sort,
        q: params.q || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const rows = query.data?.data ?? [];
  const showCost = rows.some((r) => r.costPrice !== undefined); // BE đã lọc theo quyền

  const columns = useMemo<ColumnDef<ProductResponseDto, unknown>[]>(
    () => [
      { id: 'code', header: 'Mã', cell: ({ row }) => row.original.code },
      { id: 'name', header: 'Tên', cell: ({ row }) => row.original.name ?? '—' },
      { id: 'baseUom', header: 'ĐVT', cell: ({ row }) => row.original.baseUom },
      {
        id: 'trackingType',
        header: 'Theo dõi',
        cell: ({ row }) => row.original.trackingType,
      },
      ...(showCost
        ? [
            {
              id: 'costPrice',
              header: 'Giá vốn',
              cell: ({ row }) => row.original.costPrice ?? '—',
            } satisfies ColumnDef<ProductResponseDto, unknown>,
          ]
        : []),
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('vi'),
      },
    ],
    [showCost],
  );

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Sản phẩm</h1>
      <Input
        placeholder="Tìm theo mã / tên (không dấu cũng ra — §3.10)…"
        defaultValue={params.q}
        className="max-w-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            void setParams({ q: (e.target as HTMLInputElement).value, page: 1 });
          }
        }}
      />
      <DataTable
        tableKey="products"
        columns={columns}
        rows={rows}
        meta={query.data?.meta}
        state={params}
        onStateChange={(patch) => void setParams({ ...params, ...patch })}
        status={query.status}
        onRetry={() => void query.refetch()}
        getRowId={(r) => r.id}
      />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ProductsPage />
    </Suspense>
  );
}
