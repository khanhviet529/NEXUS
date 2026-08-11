'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  orgUnitsControllerList,
  orgUnitsControllerCreate,
  orgUnitsControllerUpdate,
  orgUnitsControllerRemove,
  getApiError,
} from '@nexus/api-client';
import type { OrgUnitDto } from '@nexus/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/providers/overlay';
import { useCan } from '@/lib/auth/use-can';

/**
 * Phase 2a — cây đơn vị (§4.4b: scope department/descendants đi theo cây này).
 * DI CHUYỂN node là thao tác nặng nhất trang: đổi cây invalidate cache quyền
 * TOÀN TENANT — confirm nói rõ điều đó trước khi cho bấm.
 */
interface TreeNode extends OrgUnitDto {
  children: TreeNode[];
}

function buildTree(rows: OrgUnitDto[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** id của node + toàn bộ cây con — cấm chọn làm cha mới khi di chuyển (vòng lặp) */
function subtreeIds(node: TreeNode): Set<string> {
  const out = new Set<string>([node.id]);
  const walk = (n: TreeNode) => {
    for (const c of n.children) {
      out.add(c.id);
      walk(c);
    }
  };
  walk(node);
  return out;
}

function UnitRow({
  node,
  depth,
  allUnits,
  onReload,
}: {
  node: TreeNode;
  depth: number;
  allUnits: OrgUnitDto[];
  onReload: () => void;
}) {
  const can = useCan();
  const confirm = useConfirm();
  const [mode, setMode] = React.useState<'view' | 'rename' | 'move' | 'add-child'>('view');
  const [draft, setDraft] = React.useState('');
  const [childCode, setChildCode] = React.useState('');

  const fail = (e: unknown) => toast.error(getApiError(e).message);

  const rename = useMutation({
    mutationFn: () =>
      orgUnitsControllerUpdate(node.id, { name: draft, version: node.version }),
    onSuccess: () => {
      toast.success('Đã đổi tên');
      setMode('view');
      onReload();
    },
    onError: fail,
  });

  const move = useMutation({
    mutationFn: (parentId: string) =>
      orgUnitsControllerUpdate(node.id, { parentId, version: node.version }),
    onSuccess: () => {
      toast.success(`Đã di chuyển ${node.code} — cache quyền toàn tenant đã được làm mới`);
      setMode('view');
      onReload();
    },
    onError: fail,
  });

  const addChild = useMutation({
    mutationFn: () =>
      orgUnitsControllerCreate({ code: childCode, name: draft, parentId: node.id }),
    onSuccess: () => {
      toast.success(`Đã tạo ${childCode}`);
      setMode('view');
      onReload();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => orgUnitsControllerRemove(node.id),
    onSuccess: () => {
      toast.success(`Đã xoá ${node.code}`);
      onReload();
    },
    onError: (e) => {
      const err = getApiError(e);
      toast.error(
        err.code === 'COMMON.HAS_REFERENCES'
          ? 'Không xoá được: đơn vị còn cấp dưới hoặc thành viên'
          : err.message,
      );
    },
  });

  const banned = subtreeIds(node);
  const moveTargets = allUnits.filter((u) => !banned.has(u.id));

  return (
    <>
      <li
        className="flex flex-wrap items-center gap-2 border-b py-2 last:border-0"
        style={{ paddingInlineStart: `calc(${depth} * 1.5rem)` }}
      >
        <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
        {mode === 'rename' ? (
          <span className="flex items-center gap-1">
            <Input
              aria-label={`Tên mới cho ${node.code}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-56"
            />
            <Button size="sm" disabled={!draft || rename.isPending} onClick={() => rename.mutate()}>
              Lưu
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode('view')}>
              Huỷ
            </Button>
          </span>
        ) : (
          <span className="text-sm font-medium">{node.name}</span>
        )}

        {mode === 'move' && (
          <span className="flex items-center gap-1">
            <select
              aria-label={`Cha mới cho ${node.code}`}
              className="rounded-md border border-input bg-background px-2 text-sm"
              style={{ height: 'var(--input-h)' }}
              defaultValue=""
              onChange={(e) => {
                const parentId = e.target.value;
                if (!parentId) return;
                void confirm({
                  title: `Di chuyển ${node.code}?`,
                  description:
                    'Đổi cây đơn vị sẽ HUỶ CACHE QUYỀN CỦA TOÀN TENANT — mọi người dùng chịu một lần tính lại quyền ở request kế tiếp. Phạm vi dữ liệu theo scope department/descendants cũng đổi theo cây mới.',
                  variant: 'danger',
                  confirmLabel: 'Di chuyển',
                }).then((o) => {
                  if (o.ok) move.mutate(parentId);
                  else setMode('view');
                });
              }}
            >
              <option value="">Chọn cha mới…</option>
              {moveTargets.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => setMode('view')}>
              Huỷ
            </Button>
          </span>
        )}

        {mode === 'add-child' && (
          <span className="flex items-center gap-1">
            <Input
              aria-label="Mã đơn vị con"
              placeholder="Mã (PB-KT)"
              value={childCode}
              onChange={(e) => setChildCode(e.target.value)}
              className="w-32 font-mono"
            />
            <Input
              aria-label="Tên đơn vị con"
              placeholder="Tên"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-48"
            />
            <Button
              size="sm"
              disabled={!childCode || !draft || addChild.isPending}
              onClick={() => addChild.mutate()}
            >
              Tạo
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode('view')}>
              Huỷ
            </Button>
          </span>
        )}

        {mode === 'view' && (
          <span className="flex gap-1">
            {can('org_unit:update') && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(node.name);
                    setMode('rename');
                  }}
                >
                  Đổi tên
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode('move')}>
                  Di chuyển
                </Button>
              </>
            )}
            {can('org_unit:create') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft('');
                  setChildCode('');
                  setMode('add-child');
                }}
              >
                Thêm con
              </Button>
            )}
            {can('org_unit:delete') && node.children.length === 0 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  void confirm({
                    title: `Xoá đơn vị ${node.code}?`,
                    description: 'Chỉ xoá được đơn vị không còn cấp dưới và không còn thành viên.',
                    variant: 'danger',
                    confirmLabel: 'Xoá',
                  }).then((o) => {
                    if (o.ok) remove.mutate();
                  });
                }}
              >
                Xoá
              </Button>
            )}
          </span>
        )}
      </li>
      {node.children.map((c) => (
        <UnitRow key={c.id} node={c} depth={depth + 1} allUnits={allUnits} onReload={onReload} />
      ))}
    </>
  );
}

export default function OrgUnitsPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['org-units'], queryFn: () => orgUnitsControllerList() });

  if (query.isError) {
    const err = getApiError(query.error);
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Đơn vị</h1>
        <p className="text-sm text-muted-foreground">
          {err.status === 403 ? 'Bạn không có quyền xem cây đơn vị (org_unit:read).' : err.message}
        </p>
      </main>
    );
  }

  const tree = buildTree(query.data ?? []);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Đơn vị</h1>
      <p className="text-sm text-muted-foreground">
        Scope <b>department/descendants</b> tính theo cây này (§4.4b). Di chuyển node sẽ huỷ cache
        quyền của toàn tenant.
      </p>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : tree.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có đơn vị nào.</p>
      ) : (
        <ul>
          {tree.map((n) => (
            <UnitRow
              key={n.id}
              node={n}
              depth={0}
              allUnits={query.data ?? []}
              onReload={() => void qc.invalidateQueries({ queryKey: ['org-units'] })}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
