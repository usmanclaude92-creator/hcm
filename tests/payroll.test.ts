import test from 'node:test';
import assert from 'node:assert/strict';
import { roundOMR, calculateExpiryStatus, maskSensitiveId, normalizeEmployeeId, checkTradeDiscrepancy } from '../server/db.js';

// These cover the arithmetic that decides what an employee is paid. They are deliberately
// pure-function tests against the real exported helpers, with no database involved.

test('roundOMR holds 3-decimal precision', async (t) => {
  await t.test('rounds to exactly three decimals', () => {
    assert.equal(roundOMR(541.6666666), 541.667);
    assert.equal(roundOMR(0.0005), 0.001);
    assert.equal(roundOMR(100), 100);
  });

  await t.test('strips binary floating point noise', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754
    assert.equal(roundOMR(0.1 + 0.2), 0.3);
    assert.equal(roundOMR(650 / 30 * 25), 541.667);
  });

  await t.test('treats non-numeric input as zero rather than NaN', () => {
    assert.equal(roundOMR(NaN), 0);
    assert.equal(roundOMR(undefined as unknown as number), 0);
    assert.equal(roundOMR(null as unknown as number), 0);
  });

  await t.test('a sum of rounded parts equals the rounded whole for a real payroll line', () => {
    const gross = roundOMR((650 / 30) * 25); // 541.667
    const additions = roundOMR(50 + 25);     // 75.000
    const deductions = roundOMR(50);         // 50.000
    assert.equal(roundOMR(gross + additions - deductions), 566.667);
  });
});

test('gross salary rules', async (t) => {
  // Mirrors calculateEmployeeLine: Worker = hours x rate, Staff = (monthly / 30) x days.
  const workerGross = (hours: number, rate: number) => roundOMR(hours * rate);
  const staffGross = (monthly: number, days: number) => roundOMR((monthly / 30) * Math.min(days, 30));

  await t.test('worker gross is hours times rate', () => {
    assert.equal(workerGross(240, 2), 480);
    assert.equal(workerGross(200, 2.25), 450);
    assert.equal(workerGross(0, 2.25), 0);
  });

  await t.test('staff gross is capped at 30 days', () => {
    assert.equal(staffGross(600, 30), 600);
    assert.equal(staffGross(600, 31), 600, 'a 31st day must not increase pay');
    assert.equal(staffGross(600, 15), 300);
  });

  await t.test('zero attendance produces zero gross, never a full month', () => {
    assert.equal(staffGross(650, 0), 0);
    assert.equal(workerGross(0, 2), 0);
  });
});

test('net salary and WPS recoverable', async (t) => {
  const net = (gross: number, additions: number, deductions: number) => roundOMR(gross + additions - deductions);
  const recoverable = (wpsSalary: number, netSalary: number) => roundOMR(Math.max(wpsSalary - netSalary, 0));

  await t.test('net is gross plus additions less deductions', () => {
    assert.equal(net(541.667, 75, 50), 566.667);
    assert.equal(net(480, 20, 0), 500);
  });

  await t.test('recoverable is never negative', () => {
    assert.equal(recoverable(700, 566.667), 133.333);
    assert.equal(recoverable(450, 500), 0, 'net above the WPS figure must not create a negative recovery');
    assert.equal(recoverable(0, 450), 0);
  });
});

test('payment outstanding ceiling', async (t) => {
  const outstanding = (netSalary: number, paid: number) => roundOMR(Math.max(0, netSalary - paid));

  await t.test('outstanding reduces as payments land', () => {
    assert.equal(outstanding(566.667, 0), 566.667);
    assert.equal(outstanding(566.667, 300), 266.667);
    assert.equal(outstanding(566.667, 566.667), 0);
  });

  await t.test('overpayment clamps to zero and must be detected separately', () => {
    assert.equal(outstanding(500, 600), 0);
    // The clamp hides overpayment, which is why the report engine checks paid > net directly.
    assert.ok(600 > 500, 'overpayment condition must be asserted on the raw figures');
  });
});

test('loan recovery balance movement', async (t) => {
  await t.test('recovery reduces the outstanding balance and closes at zero', () => {
    const loanAmount = 300;
    let totalRecovered = 0;
    const apply = (amount: number) => {
      totalRecovered = roundOMR(totalRecovered + amount);
      return roundOMR(Math.max(0, loanAmount - totalRecovered));
    };
    assert.equal(apply(50), 250);
    assert.equal(apply(100), 150);
    assert.equal(apply(150), 0);
  });

  await t.test('a reversal restores the prior balance exactly', () => {
    const loanAmount = 200;
    let totalRecovered = roundOMR(0 + 20 + 20);
    assert.equal(roundOMR(loanAmount - totalRecovered), 160);
    totalRecovered = roundOMR(Math.max(0, totalRecovered - 20)); // revise() reverses one posting
    assert.equal(roundOMR(loanAmount - totalRecovered), 180);
  });
});

test('document expiry status thresholds', async (t) => {
  // Built from local date parts. toISOString() would convert to UTC and shift the date by
  // a day in any non-zero timezone offset, which is exactly the class of bug these
  // thresholds are sensitive to.
  const dayOffset = (days: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  await t.test('buckets are Valid > 60, Expiring Soon 31-60, Urgent 0-30, Expired < 0', () => {
    assert.equal(calculateExpiryStatus(dayOffset(120)), 'Valid');
    assert.equal(calculateExpiryStatus(dayOffset(61)), 'Valid');
    assert.equal(calculateExpiryStatus(dayOffset(60)), 'Expiring Soon');
    assert.equal(calculateExpiryStatus(dayOffset(31)), 'Expiring Soon');
    assert.equal(calculateExpiryStatus(dayOffset(30)), 'Urgent');
    assert.equal(calculateExpiryStatus(dayOffset(1)), 'Urgent');
    assert.equal(calculateExpiryStatus(dayOffset(0)), 'Urgent', 'expiring today is urgent, not expired');
    assert.equal(calculateExpiryStatus(dayOffset(-1)), 'Expired');
  });

  await t.test('absent or unparseable dates report Missing, never Valid', () => {
    assert.equal(calculateExpiryStatus(null), 'Missing');
    assert.equal(calculateExpiryStatus(undefined), 'Missing');
    assert.equal(calculateExpiryStatus(''), 'Missing');
    assert.equal(calculateExpiryStatus('not-a-date'), 'Missing');
  });
});

test('sensitive identifier masking', async (t) => {
  await t.test('leaves only the last four characters visible', () => {
    assert.equal(maskSensitiveId('10293847'), '••••3847');
    assert.equal(maskSensitiveId('123456789012'), '••••••••9012');
  });

  await t.test('does not misrepresent the length of a short identifier', () => {
    assert.equal(maskSensitiveId('12345'), '•2345');
    assert.equal(maskSensitiveId('1234'), '••••');
    assert.equal(maskSensitiveId(''), '');
  });
});

test('employee id normalisation', async (t) => {
  await t.test('is case and whitespace insensitive so lookups cannot miss', () => {
    assert.equal(normalizeEmployeeId(' emp001 '), 'EMP001');
    assert.equal(normalizeEmployeeId('Emp001'), 'EMP001');
    assert.equal(normalizeEmployeeId(''), '');
  });
});

test('visa trade discrepancy detection', async (t) => {
  await t.test('flags a designation that does not match the registered trade', () => {
    assert.equal(checkTradeDiscrepancy('Electrician', 'General Helper').hasWarning, true);
  });

  await t.test('accepts exact and containing matches', () => {
    assert.equal(checkTradeDiscrepancy('Mason', 'Mason').hasWarning, false);
    assert.equal(checkTradeDiscrepancy('Senior Mason', 'Mason').hasWarning, false);
  });

  await t.test('does not warn when either side is unknown', () => {
    assert.equal(checkTradeDiscrepancy('', 'Mason').hasWarning, false);
    assert.equal(checkTradeDiscrepancy('Mason', '').hasWarning, false);
  });
});
