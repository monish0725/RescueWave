// Lightweight format checks shared by forms that need to validate contact
// details before submission (Helper/Authority applications, etc). Deliberately
// permissive — this app supports many phone formats ("+91 98765 43210", "911",
// landlines) — so the phone check only rejects things that clearly aren't a
// phone number (too few digits), not anything about country-specific formatting.

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // Deliberately simple: something@something.tld, no whitespace. Good enough to
  // catch typos ("name@", "name@site") without rejecting valid real-world emails.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
