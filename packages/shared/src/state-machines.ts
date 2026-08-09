/**
 * [CORE] Vòng đời chứng từ — spec §4.7 "Máy trạng thái".
 * Mỗi transition gắn permission. Chuyển sai → 409.
 *
 * GĐ1 khai khung + máy trạng thái của module [REF] Orders (GĐ5 dùng).
 */
export interface Transition {
  from: string;
  to: string;
  action: string;
  permission: string;
}

export interface StateMachineDef {
  entity: string;
  initial: string;
  states: readonly string[];
  transitions: readonly Transition[];
}

export const ORDER_STATES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

/**
 * Enum trạng thái là NGHIỆP VỤ nên ở shared; còn MÀU của trạng thái là quyết
 * định trình bày, nằm ở apps/web/src/design-system/state-tones.ts (§9.1).
 */
export type OrderState = (typeof ORDER_STATES)[number];

export const ORDER_STATE_MACHINE: StateMachineDef = {
  entity: 'Order',
  initial: 'DRAFT',
  states: ORDER_STATES,
  transitions: [
    { from: 'DRAFT', to: 'PENDING', action: 'submit', permission: 'order:submit' },
    { from: 'PENDING', to: 'APPROVED', action: 'approve', permission: 'order:approve' },
    { from: 'PENDING', to: 'REJECTED', action: 'reject', permission: 'order:approve' },
    { from: 'REJECTED', to: 'PENDING', action: 'submit', permission: 'order:submit' },
    { from: 'DRAFT', to: 'CANCELLED', action: 'cancel', permission: 'order:update' },
  ],
};

export const STATE_MACHINES: readonly StateMachineDef[] = [ORDER_STATE_MACHINE];

export function canTransition(
  def: StateMachineDef,
  from: string,
  action: string,
): Transition | undefined {
  return def.transitions.find((t) => t.from === from && t.action === action);
}
