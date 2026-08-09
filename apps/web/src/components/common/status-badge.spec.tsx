import { describe, it, expect } from 'vitest';
import { ORDER_STATES } from '@nexus/shared';
import { renderWithProviders, screen } from '@/test/render';
import { ORDER_STATE_LABEL, ORDER_STATE_TONE, TONE_CLASS } from '@/design-system/state-tones';
import { OrderStatusBadge, StatusBadge } from './status-badge';

describe('StatusBadge + state-tones (§9.1)', () => {
  it('MỌI trạng thái trong ORDER_STATES đều có tone và nhãn — không sót cái nào', () => {
    for (const s of ORDER_STATES) {
      expect(ORDER_STATE_TONE[s], `thiếu tone cho ${s}`).toBeDefined();
      expect(ORDER_STATE_LABEL[s], `thiếu nhãn cho ${s}`).toBeTruthy();
      expect(TONE_CLASS[ORDER_STATE_TONE[s]], `thiếu class cho tone`).toBeTruthy();
    }
  });

  it('render nhãn tiếng Việt, không phải mã trạng thái thô', () => {
    renderWithProviders(<OrderStatusBadge status="PENDING" />);
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    expect(screen.queryByText('PENDING')).not.toBeInTheDocument();
  });

  it('trạng thái khác nhau → tone khác nhau (phân biệt được bằng mắt)', () => {
    const { container: c1 } = renderWithProviders(<OrderStatusBadge status="APPROVED" />);
    const approved = c1.querySelector('[role="status"]')!.className;
    const { container: c2 } = renderWithProviders(<OrderStatusBadge status="REJECTED" />);
    const rejected = c2.querySelector('[role="status"]')!.className;
    expect(approved).not.toBe(rejected);
  });

  it('emphasis đổi MẬT ĐỘ, không đổi ngữ nghĩa — cùng nhãn, khác kích thước', () => {
    const { container: subtle } = renderWithProviders(
      <OrderStatusBadge status="DRAFT" emphasis="subtle" />,
    );
    const { container: strong } = renderWithProviders(
      <OrderStatusBadge status="DRAFT" emphasis="strong" />,
    );
    expect(subtle.textContent).toBe(strong.textContent); // ngữ nghĩa giữ nguyên
    expect(subtle.querySelector('[role="status"]')!.className).not.toBe(
      strong.querySelector('[role="status"]')!.className,
    );
  });

  it('có role="status" để công nghệ trợ giúp đọc được (§5.10)', () => {
    renderWithProviders(<StatusBadge tone="info" label="Đang xử lý" />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang xử lý');
  });

  it('KHÔNG dùng màu rời rạc — mọi class tone đều qua token §5.7', () => {
    for (const cls of Object.values(TONE_CLASS)) {
      // cấm hex/rgb() viết thẳng; chỉ được dùng biến --color-* hoặc lớp token
      expect(cls).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(cls).not.toMatch(/\brgba?\(/);
    }
  });
});
