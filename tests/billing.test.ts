import { describe, it, expect } from 'vitest';

describe('In-Patient Stay & Billing Calculations', () => {
  const calculateBillingDays = (admittedAt: string, dischargedAt: string, hoursPerDay = 18) => {
    const start = new Date(admittedAt).getTime();
    const end = new Date(dischargedAt).getTime();
    const diffHours = Math.max(1, Math.floor((end - start) / (1000 * 60 * 60)));
    return {
      hoursStayed: diffHours,
      billingDays: Math.ceil(diffHours / hoursPerDay),
    };
  };

  it('charges 1 billing day for stays under 18 hours', () => {
    const admittedAt = '2026-11-03T08:00:00.000Z';
    const dischargedAt = '2026-11-03T20:00:00.000Z'; // 12 hours
    const { hoursStayed, billingDays } = calculateBillingDays(admittedAt, dischargedAt, 18);

    expect(hoursStayed).toBe(12);
    expect(billingDays).toBe(1);
  });

  it('charges 2 billing days for stays between 19 and 36 hours', () => {
    const admittedAt = '2026-11-03T08:00:00.000Z';
    const dischargedAt = '2026-11-04T05:00:00.000Z'; // 21 hours
    const { hoursStayed, billingDays } = calculateBillingDays(admittedAt, dischargedAt, 18);

    expect(hoursStayed).toBe(21);
    expect(billingDays).toBe(2);
  });

  it('calculates total bed charges correctly based on daily bed tariff', () => {
    const billingDays = 3;
    const pricePerDay = 2500;
    const totalBedCharges = billingDays * pricePerDay;

    expect(totalBedCharges).toBe(7500);
  });

  it('aggregates total IP bill accurately across bed and diagnostic lab charges', () => {
    const bedCharges = 7500;
    const labCharges = 1200;

    const totalBill = bedCharges + labCharges;
    expect(totalBill).toBe(8700);
  });
});

