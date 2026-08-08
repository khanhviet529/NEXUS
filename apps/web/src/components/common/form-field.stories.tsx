import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { Input } from '@/components/ui/input';
import { FormField } from './form-field';

/**
 * TẦNG 4 (mẫu) — Storybook: tài liệu sống + play function.
 * Story được test lại bằng `composeStories` trong vitest (form-field.spec.tsx),
 * nên play function là ASSERTION THẬT chứ không phải ảnh chụp trang trí.
 */
const meta = {
  title: 'Common/FormField',
  component: FormField,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BatBuoc: Story = {
  name: 'Bắt buộc — có dấu *',
  args: {
    label: 'Mã khách hàng',
    required: true,
    children: <Input placeholder="KH001" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Mã khách hàng')).toBeInTheDocument();
    await expect(canvas.getByText('*')).toBeInTheDocument();
  },
};

export const CoLoi: Story = {
  name: 'Có lỗi — thông báo hiện dưới ô',
  args: {
    label: 'Mã khách hàng',
    required: true,
    error: 'Mã khách hàng bắt buộc',
    children: <Input />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Mã khách hàng bắt buộc')).toBeInTheDocument();
  },
};
