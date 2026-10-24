// Tells the admin which services are plugged in. It reports only the NAMES of settings that are missing, never their values.
//   npx supabase functions deploy integration-status
// No secrets needed. It reads the ones the other functions use.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authorizeAdmin } from '../_shared/authz.ts';
import { computeStatus } from '../_shared/integrations.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  if (!(await authorizeAdmin(db, req.headers.get('authorization')))) return json({ error: 'Forbidden' }, 403);

  return json(computeStatus((name) => Deno.env.get(name)));
});
