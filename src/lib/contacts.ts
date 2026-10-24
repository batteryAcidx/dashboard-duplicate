// Phone numbers and the customer-list import. Pure functions, tested in engine-tests/ui.test.ts.

export function toE164(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return null;
  // US and Canadian numbers: the area code and the exchange never start with 0 or 1
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  return `+1${d}`;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = e164.replace(/^\+1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

export interface ImportRow { phone: string; name?: string; address?: string; last_job?: string }
export interface ImportSkip { line: number; reason: string }

export const MAX_IMPORT_ROWS = 2000;

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const HEADER_KEYS: Record<string, keyof ImportRow> = {
  phone: 'phone', mobile: 'phone', cell: 'phone', number: 'phone', telephone: 'phone', 'phone number': 'phone',
  name: 'name', 'full name': 'name', customer: 'name', contact: 'name',
  address: 'address', 'street address': 'address', location: 'address',
  last_job: 'last_job', 'last job': 'last_job', job: 'last_job', project: 'last_job', notes: 'last_job',
};

/**
 * Reads pasted rows from a spreadsheet or CSV. A header row is optional.
 * Without one, the order is: phone, name, address, last job.
 */
export function parseContactCsv(text: string): { rows: ImportRow[]; skipped: ImportSkip[]; tooMany: boolean } {
  const lines = text.replace(/\r/g, '').split('\n');
  const first = lines.find((l) => l.trim()) ?? '';
  const delim = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';

  let cols: string[] = ['phone', 'name', 'address', 'last_job'];
  let start = 0;
  const firstCells = splitLine(first, delim).map((c) => c.toLowerCase());
  const looksLikeHeader = firstCells.some((c) => c in HEADER_KEYS) && !firstCells.some((c) => toE164(c));
  if (looksLikeHeader) {
    cols = firstCells.map((c) => HEADER_KEYS[c] ?? 'skip');
    start = lines.indexOf(first) + 1;
  }

  const rows: ImportRow[] = [];
  const skipped: ImportSkip[] = [];
  const seen = new Set<string>();
  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], delim);
    const rec: Record<string, string> = {};
    cols.forEach((k, idx) => {
      if (k !== 'skip' && cells[idx]) rec[k] = cells[idx];
    });
    const phone = rec.phone ? toE164(rec.phone) : null;
    if (!phone) { skipped.push({ line: i + 1, reason: 'No valid US or Canadian phone number' }); continue; }
    if (seen.has(phone)) { skipped.push({ line: i + 1, reason: 'Duplicate number' }); continue; }
    seen.add(phone);
    rows.push({
      phone,
      ...(rec.name ? { name: rec.name.slice(0, 100) } : {}),
      ...(rec.address ? { address: rec.address.slice(0, 200) } : {}),
      ...(rec.last_job ? { last_job: rec.last_job.slice(0, 200) } : {}),
    });
  }
  return { rows: rows.slice(0, MAX_IMPORT_ROWS), skipped, tooMany: rows.length > MAX_IMPORT_ROWS };
}
