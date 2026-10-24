// What the database says when it refuses something, in plain words.

export function adminErrorText(message: string): string {
  const m = message || '';
  if (m.includes('mfa_required')) return 'Confirm your authenticator code first: sign out, sign in again and enter the code.';
  if (m.includes('forbidden')) return 'Admin access is required.';
  if (m.includes('not_ready')) return 'Not ready yet. The account needs to be live, with a texting number, an approved registration and verified call forwarding.';
  if (m.includes('not_connected')) return 'Connect a calendar first.';
  if (m.includes('provider_cannot_be_active')) return 'Only Google and Microsoft calendars can be marked as connected.';
  if (m.includes('duplicate key') || m.includes('already exists')) return 'That value is already in use by another client.';
  if (m.includes('violates check constraint') || m.includes('invalid input')) return 'That value is not allowed. Check the numbers and try again.';
  return 'Something went wrong. Check your connection and try again.';
}

