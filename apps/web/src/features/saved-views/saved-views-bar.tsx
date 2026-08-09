'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { BookmarkPlus, Check, Star, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/providers/overlay';
import { useSavedViews, type SavedView } from './use-saved-views';

/**
 * [CORE] Thanh Saved Views (§5.5 tuỳ chọn).
 *
 * Áp dụng view = GHI LẠI URL. Vì tham số danh sách sống trên URL (§5.4),
 * chỉ cần router.replace là bảng, bộ lọc, phân trang đồng bộ theo — không
 * cần cơ chế đồng bộ thứ hai và không có trạng thái "URL nói A, bảng nói B".
 */
export function SavedViewsBar({
  entity,
  membershipId,
  hiddenColumns,
}: {
  entity: string;
  membershipId?: string;
  hiddenColumns?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const { myViews, sharedViews, isPending, create, update, remove } = useSavedViews(
    entity,
    membershipId,
  );

  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');
  const [shared, setShared] = React.useState(false);

  const currentSearch = searchParams.toString();
  const applyView = (view: SavedView) => {
    const search = view.config?.search ?? '';
    router.replace(search ? `${pathname}?${search}` : pathname);
  };

  const isActive = (view: SavedView) => (view.config?.search ?? '') === currentSearch;

  const onSave = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      config: { search: currentSearch, hiddenColumns },
      isShared: shared,
    });
    toast.success(`Đã lưu view "${name.trim()}"`);
    setName('');
    setShared(false);
    setSaving(false);
  };

  const onDelete = async (view: SavedView) => {
    const res = await confirm({
      title: `Xoá view "${view.name}"?`,
      description: view.isShared ? 'View này đang được chia sẻ trong đơn vị.' : undefined,
      variant: 'danger',
    });
    if (!res.ok) return;
    await remove.mutateAsync(view.id);
    toast.success('Đã xoá view');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPending ? (
        <span className="text-sm text-muted-foreground">Đang tải view…</span>
      ) : (
        [...myViews, ...sharedViews].map((view) => (
          <span key={view.id} className="inline-flex items-center">
            <Button
              size="sm"
              variant={isActive(view) ? 'default' : 'outline'}
              onClick={() => applyView(view)}
              aria-pressed={isActive(view)}
              // Nhãn tường minh: nút này và nút "⋯" cùng chứa tên view, công
              // nghệ trợ giúp phải phân biệt được hai việc khác nhau
              aria-label={`Áp dụng view ${view.name}`}
            >
              {view.isDefault && <Star className="size-3.5" aria-label="Mặc định" />}
              {view.isShared && <Users className="size-3.5" aria-label="Đang chia sẻ" />}
              {view.name}
            </Button>
            {/* Chỉ view CỦA MÌNH mới có menu sửa/xoá — view chia sẻ là chỉ đọc */}
            {(!membershipId || view.membershipId === membershipId) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={`Tuỳ chọn view ${view.name}`}>
                    ⋯
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => void update.mutateAsync({ id: view.id, isDefault: !view.isDefault })}
                  >
                    <Check /> {view.isDefault ? 'Bỏ đặt mặc định' : 'Đặt làm mặc định'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      void onDelete(view);
                    }}
                  >
                    <Trash2 /> Xoá view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        ))
      )}

      <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
        <BookmarkPlus /> Lưu bộ lọc hiện tại
      </Button>

      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent>
          <DialogTitle>Lưu view</DialogTitle>
          <div className="mt-4 space-y-3">
            <Input
              aria-label="Tên view"
              placeholder="Ví dụ: Đơn chờ duyệt tháng này"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              Chia sẻ cho đơn vị (người khác chỉ xem, không sửa được)
            </label>
            <p className="text-xs text-muted-foreground">
              Lưu lại bộ lọc, sắp xếp, phân trang và cột đang ẩn.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaving(false)}>
                Huỷ
              </Button>
              <Button onClick={() => void onSave()} disabled={!name.trim() || create.isPending}>
                {create.isPending ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
