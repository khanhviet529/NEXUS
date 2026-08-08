import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** MSW cho môi trường Node (vitest). Trình duyệt/E2E dùng route mock riêng. */
export const server = setupServer(...handlers);
