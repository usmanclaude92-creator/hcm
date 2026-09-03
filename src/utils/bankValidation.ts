/**
 * Bank Account & IBAN Validation Utilities
 * Standards compliant with Central Bank of Oman (CBO) & ISO 13616 / ISO 7064 Mod 97-10
 */

export interface BankValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  cleaned: string;
}

export interface BankFormValidationResult {
  isValid: boolean;
  errors: {
    bankName?: string;
    bankAccountNumber?: string;
    iban?: string;
  };
  warnings: {
    bankName?: string;
    bankAccountNumber?: string;
    iban?: string;
  };
}

// Known Oman Bank SWIFT/BIC or CBO Prefix Codes
export const OMAN_BANK_CODES: Record<string, { code: string; shortName: string; accountLength?: number }> = {
  'Bank Muscat': { code: 'BMUS', shortName: 'BM', accountLength: 16 },
  'Bank Dhofar': { code: 'BDOF', shortName: 'BD', accountLength: 16 },
  'National Bank of Oman (NBO)': { code: 'NBOM', shortName: 'NBO', accountLength: 16 },
  'Sohar International': { code: 'BKSI', shortName: 'SOHAR', accountLength: 16 },
  'Oman Arab Bank (OAB)': { code: 'OARV', shortName: 'OAB', accountLength: 16 },
  'Ahli Bank': { code: 'AHLI', shortName: 'AHLI', accountLength: 16 },
  'Bank Nizwa': { code: 'NIZW', shortName: 'NIZWA', accountLength: 16 },
  'Alizz Islamic Bank': { code: 'ALIZ', shortName: 'ALIZZ', accountLength: 16 },
  'Meethaq Islamic Banking': { code: 'BMUS', shortName: 'MEETHAQ', accountLength: 16 },
  'Maisarah Islamic Banking': { code: 'BDOF', shortName: 'MAISARAH', accountLength: 16 },
  'HSBC Bank Oman': { code: 'HSBC', shortName: 'HSBC', accountLength: 16 },
  'Standard Chartered Bank': { code: 'SCBL', shortName: 'SCB', accountLength: 16 },
};

/**
 * Strips whitespace, hyphens, and non-essential formatting from account number
 */
export function cleanBankAccountNumber(val?: string | null): string {
  if (!val) return '';
  return String(val).trim().replace(/[\s\-._]/g, '');
}

/**
 * Strips whitespace and non-alphanumeric chars from IBAN, returns uppercase
 */
export function cleanIban(val?: string | null): string {
  if (!val) return '';
  return String(val).trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Formats IBAN into standard 4-character chunks for readability (e.g., OM45 BMUS 0001 2345 6789 012)
 */
export function formatIbanDisplay(val?: string | null): string {
  const cleaned = cleanIban(val);
  if (!cleaned) return '';
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * ISO 7064 Mod 97-10 IBAN Checksum Verification
 * Standard algorithm used by all banks and CBO
 */
export function validateIbanChecksum(iban: string): boolean {
  const clean = cleanIban(iban);
  if (clean.length < 15 || clean.length > 34) return false;

  // Move first 4 characters (country code + check digits) to the end
  const rearranged = clean.slice(4) + clean.slice(0, 4);

  // Convert letters to two-digit numbers (A=10, B=11 ... Z=35)
  let numericStr = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      numericStr += (code - 55).toString();
    } else if (code >= 48 && code <= 57) {
      numericStr += rearranged[i];
    } else {
      return false; // invalid character
    }
  }

  // Calculate mod 97 on large numeric string using 7-digit blocks to avoid integer overflow
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i += 7) {
    const chunk = remainder.toString() + numericStr.substring(i, Math.min(i + 7, numericStr.length));
    remainder = parseInt(chunk, 10) % 97;
  }

  return remainder === 1;
}

/**
 * Computes the 2 check digits for an IBAN given country code and BBAN
 */
export function calculateIbanCheckDigits(countryCode: string, bban: string): string {
  const cleanCountry = countryCode.trim().toUpperCase().slice(0, 2);
  const cleanBban = cleanBbanString(bban);
  const rearranged = cleanBban + cleanCountry + '00';

  let numericStr = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      numericStr += (code - 55).toString();
    } else if (code >= 48 && code <= 57) {
      numericStr += rearranged[i];
    }
  }

  let remainder = 0;
  for (let i = 0; i < numericStr.length; i += 7) {
    const chunk = remainder.toString() + numericStr.substring(i, Math.min(i + 7, numericStr.length));
    remainder = parseInt(chunk, 10) % 97;
  }

  const checkVal = 98 - remainder;
  return checkVal < 10 ? `0${checkVal}` : String(checkVal);
}

function cleanBbanString(val: string): string {
  return val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Generates an Oman CBO-compliant 23-character IBAN from bank name and account number
 */
export function generateOmanIban(bankName: string, accountNumber: string): string | null {
  const cleanAcc = cleanBankAccountNumber(accountNumber);
  if (!cleanAcc || cleanAcc.length < 6) return null;

  const bankInfo = OMAN_BANK_CODES[bankName];
  const bankCode = bankInfo?.code || 'BMUS'; // Fallback to BMUS if not matched

  // In Oman, BBAN is typically 19 chars: Bank code (3-4 chars) + account padded to 15-16 chars
  const paddedAccount = cleanAcc.padStart(15, '0');
  const bban = (bankCode + paddedAccount).slice(0, 19);

  const checkDigits = calculateIbanCheckDigits('OM', bban);
  return `OM${checkDigits}${bban}`;
}

/**
 * Validates a Bank Account Number
 * Enforces numeric standard, checks length (6–24 digits), detects accidental IBAN entry.
 */
export function validateBankAccountNumber(
  accountNumber?: string | null,
  bankName?: string | null
): BankValidationResult {
  if (!accountNumber || !accountNumber.trim()) {
    return { isValid: true, cleaned: '' };
  }

  const raw = accountNumber.trim();
  const cleaned = cleanBankAccountNumber(raw);

  // Check if user accidentally entered an IBAN in the account number field
  if (/^[A-Za-z]{2}\d{2}/.test(raw) || /^OM/i.test(raw)) {
    return {
      isValid: false,
      error: 'This looks like an IBAN. Please enter only the local numeric account number here, or paste into the Oman IBAN field.',
      cleaned,
    };
  }

  // Check for invalid letters or non-numeric characters
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      error: 'Bank account number must contain numeric digits only (0-9). Please remove letters or symbols.',
      cleaned,
    };
  }

  // Minimum length check (Oman and international banks require at least 6 digits)
  if (cleaned.length < 6) {
    return {
      isValid: false,
      error: `Account number is too short (${cleaned.length} digits). Standard account numbers require at least 6 digits.`,
      cleaned,
    };
  }

  // Maximum length check (standard BBAN is up to 24 digits; max international is 30)
  if (cleaned.length > 24) {
    return {
      isValid: false,
      error: `Account number is too long (${cleaned.length} digits). Standard account numbers cannot exceed 24 digits.`,
      cleaned,
    };
  }

  // Bank-specific advisory / checks
  if (bankName) {
    const bankInfo = OMAN_BANK_CODES[bankName];
    if (bankInfo && bankInfo.accountLength && cleaned.length < 10) {
      return {
        isValid: true,
        warning: `Most ${bankName} account numbers are 10–16 digits long. You entered ${cleaned.length} digits.`,
        cleaned,
      };
    }
  }

  return { isValid: true, cleaned };
}

/**
 * Validates an IBAN
 * Checks country format, length (23 chars for Oman), character set, and ISO 7064 Mod 97 checksum.
 */
export function validateIban(
  iban?: string | null,
  _bankName?: string | null
): BankValidationResult {
  if (!iban || !iban.trim()) {
    return { isValid: true, cleaned: '' };
  }

  const raw = iban.trim();
  const cleaned = cleanIban(raw);

  // Must begin with 2-letter country code
  if (!/^[A-Za-z]{2}/.test(cleaned)) {
    return {
      isValid: false,
      error: 'IBAN must start with a 2-letter country code (e.g. "OM" for Oman, "AE" for UAE).',
      cleaned,
    };
  }

  // Country code check
  const countryCode = cleaned.slice(0, 2).toUpperCase();

  // If Oman IBAN (standard for local payroll & WPS)
  if (countryCode === 'OM') {
    if (cleaned.length !== 23) {
      return {
        isValid: false,
        error: `Oman IBAN must be exactly 23 characters (currently ${cleaned.length} characters). Format: OM followed by 21 alphanumeric digits.`,
        cleaned,
      };
    }
  } else {
    // International IBAN length check (ISO 13616 allows 15 to 34 characters)
    if (cleaned.length < 15 || cleaned.length > 34) {
      return {
        isValid: false,
        error: `Invalid IBAN length (${cleaned.length} characters). International IBANs must be between 15 and 34 characters.`,
        cleaned,
      };
    }
  }

  // Must contain only alphanumeric characters
  if (!/^[A-Z0-9]+$/.test(cleaned)) {
    return {
      isValid: false,
      error: 'IBAN contains invalid characters. Only letters and numbers are permitted.',
      cleaned,
    };
  }

  // ISO 7064 Mod-97 checksum validation
  const isChecksumValid = validateIbanChecksum(cleaned);
  if (!isChecksumValid) {
    return {
      isValid: false,
      error: 'Invalid IBAN checksum. The account check digits do not match the official Central Bank Mod-97 algorithm. Please check for mistyped digits.',
      cleaned,
    };
  }

  return { isValid: true, cleaned };
}

/**
 * Validates the combined banking section of the employee profile.
 * Prevents accidental submission of partial or invalid bank data.
 */
export function validateBankDetails(
  bankName?: string | null,
  accountNumber?: string | null,
  iban?: string | null
): BankFormValidationResult {
  const result: BankFormValidationResult = {
    isValid: true,
    errors: {},
    warnings: {},
  };

  const cleanAcc = cleanBankAccountNumber(accountNumber);
  const cleanIb = cleanIban(iban);
  const hasBankName = Boolean(bankName && bankName.trim());
  const hasAccount = Boolean(cleanAcc);
  const hasIban = Boolean(cleanIb);

  // Validate Account Number if provided
  if (hasAccount) {
    const accResult = validateBankAccountNumber(accountNumber, bankName);
    if (!accResult.isValid && accResult.error) {
      result.isValid = false;
      result.errors.bankAccountNumber = accResult.error;
    } else if (accResult.warning) {
      result.warnings.bankAccountNumber = accResult.warning;
    }
  }

  // Validate IBAN if provided
  if (hasIban) {
    const ibanResult = validateIban(iban, bankName);
    if (!ibanResult.isValid && ibanResult.error) {
      result.isValid = false;
      result.errors.iban = ibanResult.error;
    } else if (ibanResult.warning) {
      result.warnings.iban = ibanResult.warning;
    }
  }

  // Coherence rule 1: If Bank Name is selected, user likely intended to register banking, but missed the account number
  if (hasBankName && !hasAccount && !hasIban) {
    result.warnings.bankAccountNumber = 'Bank name is selected, but account number is missing. Please provide an account number or clear bank name.';
  }

  // Coherence rule 2: If Account Number or IBAN is entered, Bank Name should be selected
  if ((hasAccount || hasIban) && !hasBankName) {
    result.warnings.bankName = 'Please select or specify the bank name for this account.';
  }

  // Coherence rule 3: If both Account Number and Oman IBAN are entered, check for consistency
  if (hasAccount && hasIban && cleanIb.startsWith('OM')) {
    // In Oman IBANs, the last 15-16 characters typically contain the account number
    const ibanSuffix = cleanIb.slice(4);
    // If the account number is longer than 6 digits and completely absent from the IBAN
    const strippedAcc = cleanAcc.replace(/^0+/, ''); // strip leading zeros
    if (strippedAcc.length >= 6 && !ibanSuffix.includes(strippedAcc)) {
      result.warnings.iban = 'The entered Account Number does not seem to match the account digits in the Oman IBAN. Please double check both.';
    }
  }

  return result;
}
