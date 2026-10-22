import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, LogOut, RotateCcw } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getCachedCompany, setCachedCompany } from '../lib/accountCache';
import { ContactTypeControl } from '../components/ContactTypeControl';
import { ContactType, PICKABLE_TYPES, TYPE_HINT, TYPE_LABEL, normalizeType } from '../lib/leadView';
import { MAX_IMPORT_ROWS, formatPhone, parseContactCsv, toE164 } from '../lib/contacts';

interface ContactRow {
  phone_e164: string;
  contact_type: string;
  name: string | null;
  company: string | null;
  address: string | null;
  last_job: string | null;
  notes: string | null;
  auto_reply: string;
  source: string;
  needs_review: boolean;
  created_at: string;
}

// 16px text on purpose: iPhones zoom the page when an input is smaller
const inputCls =
  "w-full bg-[#090d18] border border-[#232839] focus:border-[#f59e0b] focus:outline-none rounded-xl px-4 py-3 text-base font-['Inter'] text-slate-100 placeholder:text-slate-600 disabled:opacity-60";

const btnPrimary =
  "px-5 py-3 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-['Space_Grotesk'] font-bold text-sm uppercase tracking-wider cursor-pointer disabled:opacity-50";
const btnQuiet =
  "px-4 py-3 rounded-xl bg-[#111728] border border-[#212b42] hover:border-[#314060] text-slate-200 font-['Space_Grotesk'] font-bold text-sm uppercase tracking-wider cursor-pointer";

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="rounded-xl border border-[#22283a] bg-[#111625] p-5 space-y-4">
    <div>
      <h2 className="font-['Space_Grotesk'] text-lg font-bold text-slate-100 tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-[13px] text-slate-400 leading-relaxed">{hint}</p>}
    </div>
    {children}
  </section>
);

const Label: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block mb-2 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-slate-400 font-semibold">
    {children}
  </label>
);

const TypeSelect: React.FC<{ id: string; value: ContactType; onChange: (t: ContactType) => void }> = ({ id, value, onChange }) => (
  <select
    id={id}
    value={value}
    onChange={(e) => onChange(e.target.value as ContactType)}
    style={{ colorScheme: 'dark' }}
    className={inputCls}
  >
    {PICKABLE_TYPES.map((t) => (
      <option key={t} value={t}>
        {TYPE_LABEL[t]} ({TYPE_HINT[t].toLowerCase()})
      </option>
    ))}
  </select>
);

interface ContactLineProps {
  row: ContactRow;
  showReviewActions?: boolean;
  removing: string | null;
  onSetType: (row: ContactRow, type: ContactType) => Promise<string | null>;
  onRemove: (row: ContactRow) => void;
}

const ContactLine: React.FC<ContactLineProps> = ({ row, showReviewActions, removing, onSetType, onRemove }) => {
  const type = normalizeType(row.contact_type);
  const title = row.name || row.company || formatPhone(row.phone_e164);
  const sub = [row.name || row.company ? formatPhone(row.phone_e164) : '', row.last_job, row.address].filter(Boolean).join(' · ');
  return (
    <li className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <div className="font-['Space_Grotesk'] text-base font-bold text-slate-100 tracking-tight break-words">{title}</div>
        {sub && <div className="text-[13px] text-slate-400 break-words">{sub}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {showReviewActions && (
          <button type="button" onClick={() => onSetType(row, type)} className={`${btnQuiet} !py-2 !px-3 !text-xs`}>
            Looks right
          </button>
        )}
        <ContactTypeControl type={type} needsReview={row.needs_review} onChange={(t) => onSetType(row, t)} />
        <button
          type="button"
          onClick={() => onRemove(row)}
          className="px-2.5 py-1.5 rounded-lg font-['JetBrains_Mono'] text-xs text-slate-500 hover:text-red-400 cursor-pointer"
        >
          {removing === row.phone_e164 ? 'Tap again to remove' : 'Remove'}
        </button>
      </div>
    </li>
  );
};

interface ContactsPageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

export const ContactsPage: React.FC<ContactsPageProps> = ({ onNavigate, onSignOut, userEmail = '' }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(getCachedCompany(userEmail));
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'review' | ContactType>('all');
  const [panel, setPanel] = useState<'none' | 'add' | 'import'>('none');
  const [notice, setNotice] = useState<string | null>(null);

  // add form
  const [addPhone, setAddPhone] = useState('');
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<ContactType>('past_client');
  const [addJob, setAddJob] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // import
  const [csv, setCsv] = useState('');
  const [importType, setImportType] = useState<ContactType>('past_client');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // remove: tap twice
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  const load = useCallback(
    async (silent = false) => {
      if (!isSupabaseConfigured) {
        setLoadError('The dashboard is not connected to its database. Contact support.');
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setLoadError(null);
      const [acc, list] = await Promise.all([
        supabase.from('accounts').select('name').maybeSingle(),
        supabase
          .from('contacts')
          .select('phone_e164, contact_type, name, company, address, last_job, notes, auto_reply, source, needs_review, created_at')
          .order('created_at', { ascending: false })
          .limit(3000),
      ]);
      if (acc.data?.name) {
        setCompanyName(acc.data.name);
        setCachedCompany(userEmail, acc.data.name);
      }
      if (list.error) {
        setLoadError('Could not load your contacts. Check your connection and try again.');
      } else {
        setRows((list.data as ContactRow[]) || []);
      }
      setLoading(false);
    },
    [userEmail]
  );

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4000);
  };

  /* ---------- actions ---------- */

  const setContactType = async (row: ContactRow, type: ContactType): Promise<string | null> => {
    const { error } = await supabase.rpc('owner_set_contact', { p_phone: row.phone_e164, p_type: type });
    if (error) return 'Could not save. Check your connection and try again.';
    await load(true);
    return null;
  };

  const addContact = async () => {
    setAddError(null);
    const phone = toE164(addPhone);
    if (!phone) return setAddError('Enter a 10-digit US or Canadian number, for example (214) 555-0100.');
    setAddBusy(true);
    const { error } = await supabase.rpc('owner_set_contact', {
      p_phone: phone,
      p_type: addType,
      p_name: addName.trim() || null,
      p_address: addAddress.trim() || null,
      p_last_job: addJob.trim() || null,
    });
    setAddBusy(false);
    if (error) return setAddError('Could not save. Check your connection and try again.');
    setAddPhone('');
    setAddName('');
    setAddJob('');
    setAddAddress('');
    setPanel('none');
    flash(`Saved ${formatPhone(phone)} as ${TYPE_LABEL[addType].toLowerCase()}.`);
    await load(true);
  };

  const parsed = useMemo(() => parseContactCsv(csv), [csv]);

  const runImport = async () => {
    setImportError(null);
    if (parsed.rows.length === 0) return setImportError('Paste at least one row with a valid phone number.');
    setImportBusy(true);
    const { data, error } = await supabase.rpc('owner_import_contacts', { p_rows: parsed.rows, p_type: importType });
    setImportBusy(false);
    if (error) return setImportError('Could not import. Check your connection and try again.');
    const r = (data || {}) as { new?: number; updated?: number };
    setCsv('');
    setPanel('none');
    flash(`Imported ${(r.new ?? 0) + (r.updated ?? 0)} contacts as ${TYPE_LABEL[importType].toLowerCase()}.`);
    await load(true);
  };

  const removeContact = async (row: ContactRow) => {
    if (removing !== row.phone_e164) {
      setRemoving(row.phone_e164);
      setTimeout(() => setRemoving((r) => (r === row.phone_e164 ? null : r)), 4000);
      return;
    }
    setRemoving(null);
    const { error } = await supabase.from('contacts').delete().eq('phone_e164', row.phone_e164);
    if (error) return flash('Could not remove that contact. Try again.');
    setRows((prev) => prev.filter((r) => r.phone_e164 !== row.phone_e164));
  };

  /* ---------- what to show ---------- */

  const needsReview = rows.filter((r) => r.needs_review);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return rows.filter((r) => {
      if (typeFilter === 'review' && !r.needs_review) return false;
      if (typeFilter !== 'all' && typeFilter !== 'review' && normalizeType(r.contact_type) !== typeFilter) return false;
      if (!q) return true;
      return (
        (r.name || '').toLowerCase().includes(q) ||
        (r.company || '').toLowerCase().includes(q) ||
        (r.last_job || '').toLowerCase().includes(q) ||
        (r.address || '').toLowerCase().includes(q) ||
        (digits.length >= 3 && r.phone_e164.includes(digits))
      );
    });
  }, [rows, query, typeFilter]);

  const initial = (userEmail || 'U').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen w-full bg-[#090e1c] text-[#dee1f7] font-['Inter']">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-4">
        <span className="font-['Space_Grotesk'] text-lg font-bold text-slate-100 tracking-tight truncate">{companyName}</span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#111728] border border-[#212b42] text-slate-300 text-xs"
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            <span className="w-6 h-6 rounded-full bg-[#1e273d] border border-[#2d3a5a] flex items-center justify-center text-[11px] font-bold text-[#ffc174] shrink-0 sm:hidden">
              {initial}
            </span>
            <span className="max-w-[160px] truncate hidden sm:inline">{userEmail}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#0f1422] border border-[#222c42] py-1.5 z-50">
              <button type="button" onClick={() => { setMenuOpen(false); goto('/queue'); }} className="w-full px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-[#192236] text-left">
                Dashboard
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); goto('/settings'); }} className="w-full px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-[#192236] text-left">
                Settings
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); onSignOut?.(); }} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-300 hover:text-red-400 hover:bg-[#192236] text-left">
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pb-[max(5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => goto('/queue')}
          className="inline-flex items-center gap-1.5 mt-3 -ml-1 pl-1 pr-3 py-2.5 text-sm font-['Space_Grotesk'] font-bold text-slate-300 hover:text-[#ffc174] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#ffc174]" />
          Dashboard
        </button>

        <div className="mt-5 mb-6">
          <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#f59e0b] font-bold block mb-2">PEOPLE</span>
          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-100 leading-none">Contacts</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400 leading-relaxed">
            Tell us who is who, and the assistant handles each call the right way. Homeowners get booked. Past and recurring customers are
            flagged for you and you get their details by text. Suppliers and crew are never texted or booked.
          </p>
        </div>

        {notice && (
          <p role="status" className="mb-4 font-['JetBrains_Mono'] text-sm text-[#ffc174]">
            {notice}
          </p>
        )}

        {loading ? (
          <div role="status" aria-label="Loading contacts" className="space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-[#111625] border border-[#22283a]" />
            ))}
          </div>
        ) : loadError ? (
          <div className="mx-auto max-w-md py-16 text-center space-y-4">
            <p className="text-base text-slate-300">{loadError}</p>
            <button type="button" onClick={() => load()} className={`${btnPrimary} inline-flex items-center gap-1.5`}>
              <RotateCcw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {needsReview.length > 0 && (
              <Card
                title={`Needs your review (${needsReview.length})`}
                hint="The assistant guessed who these callers are from what they said. Confirm each one, or change it."
              >
                <ul className="divide-y divide-[#1b2336]">
                  {needsReview.map((r) => (
                    <ContactLine key={r.phone_e164} row={r} showReviewActions removing={removing} onSetType={setContactType} onRemove={removeContact} />
                  ))}
                </ul>
              </Card>
            )}

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setPanel(panel === 'add' ? 'none' : 'add')} className={btnQuiet} aria-expanded={panel === 'add'}>
                Add a contact
              </button>
              <button type="button" onClick={() => setPanel(panel === 'import' ? 'none' : 'import')} className={btnQuiet} aria-expanded={panel === 'import'}>
                Import a customer list
              </button>
            </div>

            {panel === 'add' && (
              <Card title="Add a contact">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="add-phone">Phone number</Label>
                    <input id="add-phone" type="tel" inputMode="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="(214) 555-0100" className={inputCls} />
                  </div>
                  <div>
                    <Label htmlFor="add-name">Name (optional)</Label>
                    <input id="add-name" type="text" value={addName} onChange={(e) => setAddName(e.target.value)} maxLength={100} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="add-type">Who is this?</Label>
                    <TypeSelect id="add-type" value={addType} onChange={setAddType} />
                  </div>
                  <div>
                    <Label htmlFor="add-job">Last job (optional)</Label>
                    <input id="add-job" type="text" value={addJob} onChange={(e) => setAddJob(e.target.value)} maxLength={200} placeholder="2024 full reroof" className={inputCls} />
                  </div>
                  <div>
                    <Label htmlFor="add-address">Address (optional)</Label>
                    <input id="add-address" type="text" value={addAddress} onChange={(e) => setAddAddress(e.target.value)} maxLength={200} className={inputCls} />
                  </div>
                </div>
                {addError && <p role="alert" className="text-sm text-red-400">{addError}</p>}
                <button type="button" onClick={addContact} disabled={addBusy} className={btnPrimary}>
                  {addBusy ? 'Saving…' : 'Save contact'}
                </button>
              </Card>
            )}

            {panel === 'import' && (
              <Card
                title="Import a customer list"
                hint="Paste rows from a spreadsheet or CSV: phone, name, address, last job. A header row is fine. Past customers get recognised from their first call, greeted by name and flagged for you."
              >
                <div>
                  <Label htmlFor="import-type">Import these as</Label>
                  <TypeSelect id="import-type" value={importType} onChange={setImportType} />
                </div>
                <div>
                  <Label htmlFor="import-csv">Paste your list</Label>
                  <textarea
                    id="import-csv"
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    rows={7}
                    placeholder={'phone, name, address, last job\n(214) 555-0101, Dana Ruiz, 9 Elm Dr, 2024 full reroof'}
                    className={`${inputCls} font-['JetBrains_Mono'] !text-sm`}
                  />
                </div>
                {csv.trim() && (
                  <p className="text-sm text-slate-300" role="status">
                    {parsed.rows.length} ready to import
                    {parsed.skipped.length > 0 ? `, ${parsed.skipped.length} skipped (no valid number or a duplicate)` : ''}
                    {parsed.tooMany ? `. Only the first ${MAX_IMPORT_ROWS} will be imported.` : '.'}
                  </p>
                )}
                {importError && <p role="alert" className="text-sm text-red-400">{importError}</p>}
                <button type="button" onClick={runImport} disabled={importBusy || parsed.rows.length === 0} className={btnPrimary}>
                  {importBusy ? 'Importing…' : `Import ${parsed.rows.length || ''} contacts`.replace('  ', ' ')}
                </button>
              </Card>
            )}

            <Card title={`All contacts (${rows.length})`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, number or job"
                  aria-label="Search contacts"
                  className={inputCls}
                />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | 'review' | ContactType)}
                  aria-label="Filter by type"
                  style={{ colorScheme: 'dark' }}
                  className={inputCls}
                >
                  <option value="all">Everyone</option>
                  <option value="review">Needs review</option>
                  {PICKABLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-400 leading-relaxed">
                  No contacts yet. Import your customer list so past customers are recognised from their first call, or add a supplier so
                  their calls never get a text.
                </p>
              ) : shown.length === 0 ? (
                <p className="text-sm text-slate-400">Nobody matches that.</p>
              ) : (
                <ul className="divide-y divide-[#1b2336]">
                  {shown.slice(0, 200).map((r) => (
                    <ContactLine key={r.phone_e164} row={r} removing={removing} onSetType={setContactType} onRemove={removeContact} />
                  ))}
                  {shown.length > 200 && (
                    <li className="py-3 text-sm text-slate-500">Showing the first 200. Search to narrow it down.</li>
                  )}
                </ul>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};
