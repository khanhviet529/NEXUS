import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ORDER_STATES } from '@nexus/shared';
import { OrderStatusBadge, StatusBadge } from './status-badge';

/**
 * Story là nơi ĐỐI CHIẾU BẰNG MẮT toàn bộ tone cạnh nhau — thứ mà test
 * assertion không thay được: hai tone khác nhau về class vẫn có thể trông
 * giống hệt nhau trên màn hình.
 */
const meta = {
  title: 'Common/StatusBadge',
  component: StatusBadge,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MoiTrangThaiDonHang: Story = {
  name: 'Mọi trạng thái đơn hàng',
  args: { tone: 'neutral', label: '' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      {ORDER_STATES.map((s) => (
        <OrderStatusBadge key={s} status={s} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Chờ duyệt')).toBeInTheDocument();
    await expect(canvas.getByText('Đã huỷ')).toBeInTheDocument();
  },
};

export const BaMucNhanManh: Story = {
  name: 'Ba mức nhấn mạnh (preset sẽ chọn)',
  args: { tone: 'neutral', label: '' },
  render: () => (
    <div className="flex items-center gap-3">
      <OrderStatusBadge status="PENDING" emphasis="subtle" />
      <OrderStatusBadge status="PENDING" emphasis="normal" />
      <OrderStatusBadge status="PENDING" emphasis="strong" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Chờ duyệt')).toHaveLength(3);
  },
};
