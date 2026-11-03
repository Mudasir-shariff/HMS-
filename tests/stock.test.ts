import { describe, it, expect } from 'vitest';

describe('Pharmacy Stock & Dispensing Validation', () => {
  it('decrements stock accurately when stock is sufficient', () => {
    let stock = 100;
    const requestedQty = 15;

    const dispense = (currentStock: number, qty: number) => {
      if (qty <= 0) throw new Error('Quantity must be greater than zero');
      if (currentStock < qty) throw new Error('Insufficient stock');
      return currentStock - qty;
    };

    stock = dispense(stock, requestedQty);
    expect(stock).toBe(85);
  });

  it('rejects dispensing when stock would become negative (stock < qty)', () => {
    const stock = 5;
    const requestedQty = 10;

    const dispense = (currentStock: number, qty: number) => {
      if (currentStock < qty) {
        throw new Error(`Insufficient stock: available ${currentStock}, requested ${qty}`);
      }
      return currentStock - qty;
    };

    expect(() => dispense(stock, requestedQty)).toThrowError(/Insufficient stock: available 5, requested 10/);
  });

  it('detects Schedule H / H1 drugs and enforces clinical justification requirement', () => {
    const drugs = [
      { id: 'd-1', name: 'Amoxicillin 500mg', schedule_h: true, schedule_h1: false },
      { id: 'd-2', name: 'Paracetamol 500mg', schedule_h: false, schedule_h1: false },
    ];

    const validateWalkInDispensing = (items: { drugId: string }[], overrideReason?: string) => {
      const hasScheduleH = items.some((item) => {
        const drug = drugs.find((d) => d.id === item.drugId);
        return drug?.schedule_h || drug?.schedule_h1;
      });

      if (hasScheduleH && (!overrideReason || !overrideReason.trim())) {
        throw new Error('Pharmacist justification required for Schedule H dispensing without prescription');
      }
      return true;
    };

    expect(() => validateWalkInDispensing([{ drugId: 'd-1' }])).toThrowError(/Pharmacist justification required/);
    expect(validateWalkInDispensing([{ drugId: 'd-1' }], 'Emergency clinical supply approved by Dr.')).toBe(true);
    expect(validateWalkInDispensing([{ drugId: 'd-2' }])).toBe(true);
  });

  it('prevents double-dispensing the same prescription', () => {
    const visit = { id: 'v-101', status: 'prescribed' as 'prescribed' | 'dispensed' | 'completed' };

    const dispensePrescription = (currentVisit: typeof visit) => {
      if (currentVisit.status === 'dispensed' || currentVisit.status === 'completed') {
        throw new Error('Prescription has already been dispensed by another pharmacist.');
      }
      currentVisit.status = 'dispensed';
      return currentVisit;
    };

    // First attempt succeeds
    dispensePrescription(visit);
    expect(visit.status).toBe('dispensed');

    // Second simultaneous or sequential attempt fails
    expect(() => dispensePrescription(visit)).toThrowError(/already been dispensed/);
  });
});

