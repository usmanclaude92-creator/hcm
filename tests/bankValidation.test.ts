import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOmanIban,
  validateIbanChecksum,
  validateBankAccountNumber,
  cleanIban,
} from '../src/utils/bankValidation.js';

// The IBAN produced here is what a salary transfer is instructed against, so a silently
// wrong-but-checksum-valid result is worse than no result at all.

test('Oman IBAN generation', async (t) => {
  await t.test('produces a 23-character IBAN that passes its own checksum', () => {
    const iban = generateOmanIban('Bank Muscat', '123456789012345');
    assert.ok(iban, 'expected an IBAN for a 15-digit account');
    assert.equal(iban!.length, 23);
    assert.ok(iban!.startsWith('OM'));
    assert.equal(validateIbanChecksum(iban!), true);
  });

  await t.test('refuses rather than truncating an account it cannot encode', () => {
    // Every bank in the table is configured at 16 digits. A 4-character bank code plus 16
    // digits exceeds the 19-character BBAN, and the previous implementation sliced off the
    // final digit -- producing a valid-looking IBAN for the wrong account.
    const iban = generateOmanIban('Bank Muscat', '1234567890123456');
    assert.equal(iban, null, 'an account that does not fit must not be silently truncated');
  });

  await t.test('refuses an unrecognised bank instead of guessing a code', () => {
    assert.equal(generateOmanIban('Some Bank That Does Not Exist', '123456789012'), null);
  });

  await t.test('refuses an implausibly short account number', () => {
    assert.equal(generateOmanIban('Bank Muscat', '12345'), null);
    assert.equal(generateOmanIban('Bank Muscat', ''), null);
  });

  await t.test('encodes the account digits verbatim, not a rounded or padded variant', () => {
    const account = '987654321098';
    const iban = generateOmanIban('Bank Dhofar', account);
    assert.ok(iban);
    assert.ok(iban!.endsWith(account), 'the account number must survive into the IBAN intact');
  });
});

test('IBAN checksum verification', async (t) => {
  await t.test('rejects a mutated digit', () => {
    const iban = generateOmanIban('Bank Muscat', '123456789012345')!;
    const lastChar = iban.slice(-1);
    const swapped = iban.slice(0, -1) + (lastChar === '0' ? '1' : '0');
    assert.equal(validateIbanChecksum(swapped), false);
  });

  await t.test('rejects malformed input rather than throwing', () => {
    assert.equal(validateIbanChecksum(''), false);
    assert.equal(validateIbanChecksum('OM'), false);
    assert.equal(validateIbanChecksum('OM12!!@@####'), false);
  });

  await t.test('ignores presentation spacing', () => {
    const iban = generateOmanIban('Bank Muscat', '123456789012345')!;
    const spaced = iban.replace(/(.{4})/g, '$1 ').trim();
    assert.equal(cleanIban(spaced), iban);
    assert.equal(validateIbanChecksum(spaced), true);
  });
});

test('bank account number validation', async (t) => {
  await t.test('accepts a blank value as "not provided"', () => {
    assert.equal(validateBankAccountNumber('').isValid, true);
    assert.equal(validateBankAccountNumber(null).isValid, true);
  });

  await t.test('catches an IBAN pasted into the account number field', () => {
    const result = validateBankAccountNumber('OM12BMUS0000123456789012');
    assert.equal(result.isValid, false);
    assert.match(result.error || '', /IBAN/i);
  });
});
