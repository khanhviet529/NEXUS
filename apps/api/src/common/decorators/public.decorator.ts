import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Endpoint không cần xác thực (login, health, forgot-password) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
