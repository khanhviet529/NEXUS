import { describe, it, expect } from 'vitest';
import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import * as stories from './form-field.stories';

/**
 * Cầu nối tầng 4 → runner: `composeStories` chạy LẠI story + play function
 * trong vitest. Nhờ vậy story không trôi thành ảnh chụp chết, và CI không
 * cần dựng server Storybook để có assertion.
 */
const { BatBuoc, CoLoi } = composeStories(stories);

describe('FormField — story chạy như test', () => {
  it('BatBuoc: nhãn + dấu bắt buộc', async () => {
    const { container } = render(<BatBuoc />);
    await BatBuoc.play?.({ canvasElement: container });
    expect(screen.getByText('Mã khách hàng')).toBeInTheDocument();
  });

  it('CoLoi: thông báo lỗi hiển thị', async () => {
    const { container } = render(<CoLoi />);
    await CoLoi.play?.({ canvasElement: container });
    expect(screen.getByText('Mã khách hàng bắt buộc')).toBeInTheDocument();
  });
});
