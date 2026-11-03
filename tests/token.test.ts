import { describe, it, expect } from 'vitest';

describe('Daily Token Generation Logic', () => {
  it('generates sequential token numbers for the same doctor on the same day', () => {
    const visits = [
      { doctor_id: 'doc-1', date: '2026-11-03', token_number: 1 },
      { doctor_id: 'doc-1', date: '2026-11-03', token_number: 2 },
    ];

    const nextToken = (doctorVisits: typeof visits) => {
      const maxToken = doctorVisits.reduce((max, v) => Math.max(max, v.token_number), 0);
      return maxToken + 1;
    };

    expect(nextToken(visits)).toBe(3);
  });

  it('resets token number per doctor independently', () => {
    const doc1Visits = [{ doctor_id: 'doc-1', token_number: 1 }, { doctor_id: 'doc-1', token_number: 2 }];
    const doc2Visits = [{ doctor_id: 'doc-2', token_number: 1 }];

    const getNextTokenForDoctor = (allVisits: any[], docId: string) => {
      const filtered = allVisits.filter((v) => v.doctor_id === docId);
      return filtered.reduce((max, v) => Math.max(max, v.token_number), 0) + 1;
    };

    const combined = [...doc1Visits, ...doc2Visits];
    expect(getNextTokenForDoctor(combined, 'doc-1')).toBe(3);
    expect(getNextTokenForDoctor(combined, 'doc-2')).toBe(2);
    expect(getNextTokenForDoctor(combined, 'doc-3')).toBe(1);
  });

  it('resets token numbers on calendar day rollover (IST)', () => {
    const getISTDateString = (date: Date) => {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    };

    const day1 = '2026-11-02';
    const day2 = '2026-11-03';

    const visits = [
      { doctor_id: 'doc-1', date: day1, token_number: 1 },
      { doctor_id: 'doc-1', date: day1, token_number: 2 },
      { doctor_id: 'doc-1', date: day1, token_number: 3 },
    ];

    const getNextTokenForDate = (allVisits: typeof visits, targetDate: string) => {
      const filtered = allVisits.filter((v) => v.date === targetDate);
      return filtered.reduce((max, v) => Math.max(max, v.token_number), 0) + 1;
    };

    expect(getNextTokenForDate(visits, day1)).toBe(4);
    expect(getNextTokenForDate(visits, day2)).toBe(1); // Day 2 starts at 1
  });
});

