import { describe, it, expect } from 'vitest';
import { ORDER_STATES } from '@nexus/shared';
import { renderWithProviders, screen } from '@/test/render';
import {
  ORDER_STATE_LABEL,
  ORDER_STATE_TONE,
  TONE_SYMBOL,
  TONE_VAR,
} from '@/design-system/state-tones';
import { PRESETS } from '@/design-system/registry';
import { OrderStatusBadge, StatusBadge } from './status-badge';

const badge = (c: HTMLElement) => c.querySelector('[role="status"]')!;

describe('StatusBadge + state-tones (§9.1)', () => {
  it('MỌI trạng thái trong ORDER_STATES đều có tone, nhãn, màu và ký hiệu', () => {
    for (const s of ORDER_STATES) {
      expect(ORDER_STATE_TONE[s], `thiếu tone cho ${s}`).toBeDefined();
      expect(ORDER_STATE_LABEL[s], `thiếu nhãn cho ${s}`).toBeTruthy();
      expect(TONE_VAR[ORDER_STATE_TONE[s]], `thiếu token màu`).toBeTruthy();
      expect(TONE_SYMBOL[ORDER_STATE_TONE[s]], `thiếu ký hiệu`).toBeTruthy();
    }
  });

  it('render nhãn tiếng Việt, không phải mã trạng thái thô', () => {
    renderWithProviders(<OrderStatusBadge status="PENDING" />);
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    expect(screen.queryByText('PENDING')).not.toBeInTheDocument();
  });

  it('mỗi tone có màu RIÊNG — không hai trạng thái đối lập cùng một màu', () => {
    // Bản trước warning và success cùng lấy từ --color-primary: "Chờ duyệt" và
    // "Đã duyệt" gần như trùng màu.
    const vars = Object.values(TONE_VAR);
    expect(new Set(vars).size).toBe(vars.length);
  });

  it('màu KHÔNG phải dấu hiệu duy nhất — mỗi tone kèm ký hiệu riêng (§8.4)', () => {
    // 8% nam giới mù màu đỏ-lục: xanh "Đã duyệt" và đỏ "Từ chối" không có dấu
    // hiệu thứ hai thì họ không phân biệt được.
    const symbols = Object.values(TONE_SYMBOL);
    expect(new Set(symbols).size).toBe(symbols.length);

    const { container } = renderWithProviders(<OrderStatusBadge status="APPROVED" />);
    expect(badge(container).textContent).toContain(TONE_SYMBOL.success);
  });

  it('emphasis mặc định lấy từ preset, không phải hằng số trong component (§9.1)', () => {
    // Enterprise là 'subtle'. Đây là hợp đồng khiến preset Operations đổi sang
    // 'strong' mà không phải sửa một dòng nào trong status-badge.tsx.
    const { container } = renderWithProviders(<OrderStatusBadge status="DRAFT" />);
    expect(badge(container).getAttribute('data-emphasis')).toBe(
      PRESETS.enterprise.behavior.statusEmphasis,
    );
  });

  it('emphasis đổi MẬT ĐỘ, không đổi ngữ nghĩa — cùng nhãn, khác hình thức', () => {
    const { container: subtle } = renderWithProviders(
      <OrderStatusBadge status="DRAFT" emphasis="subtle" />,
    );
    const { container: strong } = renderWithProviders(
      <OrderStatusBadge status="DRAFT" emphasis="strong" />,
    );
    expect(subtle.textContent).toBe(strong.textContent); // ngữ nghĩa giữ nguyên
    expect(badge(subtle).getAttribute('style')).not.toBe(badge(strong).getAttribute('style'));
  });

  it('cỡ chữ và padding đến từ token derived, không phải class cố định', () => {
    const { container } = renderWithProviders(<StatusBadge tone="info" label="x" />);
    const style = badge(container).getAttribute('style') ?? '';
    expect(style).toContain('var(--badge-font-size)');
    expect(style).toContain('var(--badge-padding)');
  });

  it('có role="status" để công nghệ trợ giúp đọc được (§5.10)', () => {
    renderWithProviders(<StatusBadge tone="info" label="Đang xử lý" />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang xử lý');
  });

  it('KHÔNG màu rời rạc — mọi tone đều là var(--tone-*)', () => {
    for (const v of Object.values(TONE_VAR)) {
      expect(v).toMatch(/^var\(--tone-[a-z]+\)$/);
    }
  });
});
