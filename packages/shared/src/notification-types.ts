/**
 * [CORE] Loại thông báo + kênh mặc định — README §Registry.
 * Nội dung cụ thể bổ sung ở GĐ7; khung khai báo cố định từ GĐ1.
 */
export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationTypeDef {
  type: string;
  defaultChannels: readonly NotificationChannel[];
}

export const NOTIFICATION_TYPES = {
  SECURITY_ALERT: {
    type: 'SECURITY_ALERT',
    defaultChannels: ['in_app', 'email'],
  },
  ACCOUNT_INVITED: {
    type: 'ACCOUNT_INVITED',
    defaultChannels: ['email'],
  },
  PASSWORD_CHANGED: {
    type: 'PASSWORD_CHANGED',
    defaultChannels: ['email'],
  },
  JOB_COMPLETED: {
    type: 'JOB_COMPLETED',
    defaultChannels: ['in_app'],
  },
} as const satisfies Record<string, NotificationTypeDef>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
