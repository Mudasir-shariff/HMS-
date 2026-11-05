export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function calculateSmartQuantity(
  drugType: string,
  morning: boolean,
  afternoon: boolean,
  night: boolean,
  numDays: number,
  doctorEnteredQty?: number
): number {
  const type = drugType?.toLowerCase() || 'tablet';
  if (type === 'syrup') {
    return 1;
  }
  if (type === 'tablet' || type === 'capsule') {
    const dosesPerDay = (morning ? 1 : 0) + (afternoon ? 1 : 0) + (night ? 1 : 0);
    return Math.max(1, dosesPerDay * Math.max(1, numDays));
  }
  if (doctorEnteredQty && doctorEnteredQty > 0) {
    return doctorEnteredQty;
  }
  return 1;
}

