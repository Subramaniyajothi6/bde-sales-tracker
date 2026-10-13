/** Keep the last 10 digits, so "+91 98765 43210" and "9876543210" match. Null if not a valid mobile number. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length !== 10 || !/^[6-9]/.test(last10)) return null;
  if (digits.length > 10 && !/^(91|091|0)$/.test(digits.slice(0, -10))) return null;
  return last10;
}

/** 9876543210 -> "+91 98765 43210" */
export const formatPhone = (p: string) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;
