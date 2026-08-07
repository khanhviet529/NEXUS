import { SetMetadata } from '@nestjs/common';

export const ALLOW_AUTHENTICATED_KEY = 'allowAuthenticated';

/**
 * Endpoint chỉ cần ĐĂNG NHẬP, không cần permission cụ thể — nhóm §2.1 của
 * permission-matrix (GET /me, PATCH /me/preferences, POST /auth/logout).
 * Dùng dè xẻn: mọi endpoint nghiệp vụ phải @RequirePermission.
 */
export const AllowAuthenticated = () => SetMetadata(ALLOW_AUTHENTICATED_KEY, true);
