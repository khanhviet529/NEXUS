import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

/**
 * i18n giao diện (§12 #5 — có TỪ ĐẦU, "bổ sung sau rất tốn").
 * Không dùng i18n routing: locale nằm trong cookie `locale`, đổi bằng
 * POST route/action set cookie — app quản trị nội bộ không cần URL /vi /en.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get('locale')?.value;
  const locale = raw === 'en' ? 'en' : 'vi';
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
