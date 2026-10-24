// Helpers for the emails sent to clients from the admin. Pure, so they are tested on their own.

export const MAX_SUBJECT = 150;
export const MAX_BODY = 5000;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text in, simple safe HTML out. Nothing typed into the box can become markup. */
export function textToHtml(body: string): string {
  const paras = body.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const html = paras
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;color:#1b1f2a;max-width:560px">${html}</div>`;
}

export function validateEmailInput(subject: unknown, body: unknown): { ok: true; subject: string; body: string } | { ok: false; error: string } {
  if (typeof subject !== 'string' || !subject.trim()) return { ok: false, error: 'Add a subject.' };
  if (typeof body !== 'string' || !body.trim()) return { ok: false, error: 'Write something in the message.' };
  if (/[\r\n]/.test(subject)) return { ok: false, error: 'The subject must be one line.' };
  if (subject.length > MAX_SUBJECT) return { ok: false, error: `The subject is too long (most ${MAX_SUBJECT} characters).` };
  if (body.length > MAX_BODY) return { ok: false, error: `The message is too long (most ${MAX_BODY} characters).` };
  return { ok: true, subject: subject.trim(), body: body.trim() };
}

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
