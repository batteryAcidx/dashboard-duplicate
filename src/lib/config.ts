// Settings that come from the environment, in one place. Nothing else reads import.meta.env for these.
// import.meta.env is filled in by Vite. It is empty when the code is run by the tests.
const env = import.meta.env ?? {};

/** Where the dashboard lives. Used in the emails we send, so the links point to the right place. */
export const APP_URL = (env.VITE_APP_URL || 'https://dashboard.wedgescale.com').replace(/\/+$/, '');
/** The address of the backend. Used to show the exact addresses to paste into Stripe and Google. */
export const BACKEND_URL = (env.VITE_SUPABASE_URL || 'https://<your-project-ref>.supabase.co').replace(/\/+$/, '');
