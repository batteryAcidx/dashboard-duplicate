import { useEffect, useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { QueuePage } from './pages/QueuePage';
import { SetupPage } from './pages/SetupPage'; // SETUP
import { RegistrationPage } from './pages/RegistrationPage'; // REGISTRATION
import { SettingsPage } from './pages/SettingsPage'; // SETTINGS
import { ContactsPage } from './pages/ContactsPage'; // CONTACTS
import { AdminPage } from './pages/AdminPage'; // ADMIN
import { NotFoundPage } from './pages/NotFoundPage';
import { authApi } from './api';
import { SyncProvider } from './lib/sync';
import { parseTarget } from './domain';
import { clearAccountCache } from './lib/accountCache';


export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // strip trailing slashes, so /queue/ behaves like /queue
  const getCleanPath = (pathname: string) => {
    const clean = pathname.split('?')[0].trim().replace(/\/+$/, '');
    if (!clean) return '/login';
    return clean.startsWith('/') ? clean : `/${clean}`;
  };

  const getInitialPath = () => {
    if (typeof window === 'undefined') return '/login';

    const rawSearch = window.location.search;
    const rawHash = window.location.hash;

    // an expired or invalid email link should reach the set-password page too
    const hasLinkError =
      rawHash.includes('error_code=') ||
      rawHash.includes('error=access_denied') ||
      rawSearch.includes('error_code=');

    // If the URL contains a recovery or invite token (or a link error), forward to /set-password while preserving it
    const hasRecoveryOrInviteToken =
      hasLinkError ||
      rawSearch.includes('code=') ||
      rawSearch.includes('type=recovery') ||
      rawSearch.includes('type=invite') ||
      rawHash.includes('type=recovery') ||
      rawHash.includes('type=invite') ||
      rawHash.includes('access_token=');

    if (hasRecoveryOrInviteToken) {
      if (window.location.pathname !== '/set-password') {
        window.history.replaceState({}, '', '/set-password' + rawSearch + rawHash);
      }
      return '/set-password';
    }

    return getCleanPath(window.location.pathname);
  };

  const [currentPath, setCurrentPath] = useState<string>(getInitialPath);

  useEffect(() => {
    if (!authApi.isConfigured) {
      setIsAuthChecking(false);
      return;
    }

    let isMounted = true;

    // wait for Supabase to initialize, but never hang if it fails
    authApi
      .getSession()
      .then(({ session }) => {
        if (!isMounted) return;
        setIsAuthenticated(Boolean(session?.user));
        setUserEmail(session?.user?.email || '');
      })
      .catch(() => {
        if (isMounted) {
          setIsAuthenticated(false);
          clearAccountCache();
          setUserEmail('');
        }
      })
      .finally(() => {
        if (isMounted) setIsAuthChecking(false);
      });

    // Register onAuthStateChange once
    const stopListening = authApi.onChange((event, session) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY' || (session?.user)) {
        setIsAuthenticated(true);
        setUserEmail(session?.user?.email || '');
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUserEmail('');
      }
      setIsAuthChecking(false);
    });

    return () => {
      isMounted = false;
      stopListening();
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(getCleanPath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = (to: string) => {
    const t = parseTarget(to);
    const clean = getCleanPath(t.path);
    window.history.pushState({}, '', clean + t.search + t.hash);
    setCurrentPath(clean);
  };

  const handleSignIn = (email: string) => {
    setIsAuthenticated(true);
    setUserEmail(email);
    navigate('/queue');
  };

  const handleSignOut = async () => {
    if (authApi.isConfigured) {
      try {
        await authApi.signOut();
      } catch (err) {
        console.warn('Sign out error:', err);
      }
    }
    setIsAuthenticated(false);
    setUserEmail('');
    navigate('/login');
  };

  // Show short loading state until Supabase finishes reading any tokens & initializing session
  if (isAuthChecking) {
    return (
      <div className="min-h-screen w-full bg-[#0e1322] flex flex-col items-center justify-center px-4 select-none">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#252939] border border-[#f59e0b]/50 flex items-center justify-center shadow-sm">
            <div className="w-5 h-5 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="font-body text-xs tracking-wide text-slate-400 font-bold">
            Checking your link…
          </p>
        </div>
      </div>
    );
  }

  // Known routes
  const isLoginPage = currentPath === '/login' || currentPath === '/';
  const isForgotPasswordPage = currentPath === '/forgot-password';
  const isSetPasswordPage = currentPath === '/set-password';
  const isDirect404Preview = currentPath === '/404' || currentPath === '/not-found';
  const isQueuePage = currentPath === '/queue' || currentPath === '/dashboard';
  const isSetupPage = currentPath === '/setup' || currentPath === '/settings'; // SETUP and SETTINGS
  const isContactsPage = currentPath === '/contacts'; // CONTACTS
  const isRegistrationPage = currentPath === '/registration'; // REGISTRATION
  const isAdminRoute = currentPath === '/admin' || currentPath.startsWith('/admin/'); // ADMIN
  const adminAccountId = currentPath.startsWith('/admin/') ? currentPath.slice('/admin/'.length).split('/')[0] : null; // ADMIN
  const isConversationsRoute = currentPath.startsWith('/conversations/');
  const conversationId = isConversationsRoute ? currentPath.replace('/conversations/', '').split('/')[0] : null;

  const isKnownPublicRoute =
    isLoginPage ||
    isForgotPasswordPage ||
    isSetPasswordPage ||
    isDirect404Preview;

  // Rule 1: NEVER redirect signed-out or signed-in users away from /set-password
  if (isSetPasswordPage) {
    return (
      <div className="min-h-screen bg-[#0e1322] text-[#dee1f7] font-body selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col w-full max-w-full overflow-x-hidden">
        <SetPasswordPage onNavigate={navigate} />
      </div>
    );
  }

  // Rule 2: Protect /queue, /setup and /conversations/:id: if user is signed out, redirect to /login
  if (!isAuthenticated && (isQueuePage || isConversationsRoute || isSetupPage || isContactsPage || isRegistrationPage || isAdminRoute)) { // SETUP
    window.history.replaceState({}, '', '/login');
    return (
      <div className="min-h-screen bg-[#0e1322] text-[#dee1f7] font-body selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col w-full max-w-full overflow-x-hidden">
        <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
      </div>
    );
  }

  // Rule 3: Redirect signed-in users away from /login to /queue
  if (isAuthenticated && isLoginPage) {
    window.history.replaceState({}, '', '/queue');
    return (
      <div className="min-h-screen bg-[#0e1322] text-[#dee1f7] font-body selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col w-full max-w-full overflow-x-hidden">
        <SyncProvider>
          <QueuePage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} />
        </SyncProvider>
      </div>
    );
  }

  // Rule 4: Unknown route and signed out: redirect to /login
    if (!isAuthenticated && !isKnownPublicRoute && !isQueuePage && !isConversationsRoute && !isSetupPage && !isContactsPage && !isRegistrationPage && !isAdminRoute) { // SETUP
    window.history.replaceState({}, '', '/login');
    return (
      <div className="min-h-screen bg-[#0e1322] text-[#dee1f7] font-body selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col w-full max-w-full overflow-x-hidden">
        <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
      </div>
    );
  }

  // Render view
  return (
    <SyncProvider>
    <div className="min-h-screen bg-[#0e1322] text-[#dee1f7] font-body selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col w-full max-w-full overflow-x-hidden">
      {isDirect404Preview ? (
        <NotFoundPage onNavigate={navigate} />
      ) : isForgotPasswordPage ? (
        <ForgotPasswordPage onNavigate={navigate} />
            ) : isAdminRoute ? ( // ADMIN
        isAuthenticated ? (
          <AdminPage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} accountId={adminAccountId} />
        ) : (
          <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
        )
      ) : isRegistrationPage ? ( // REGISTRATION
        isAuthenticated ? (
          <RegistrationPage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} />
        ) : (
          <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
        )
      ) : isContactsPage ? ( // CONTACTS
        isAuthenticated ? (
          <ContactsPage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} />
        ) : (
          <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
        )
      ) : isSetupPage ? ( // SETUP
        isAuthenticated ? (
                    currentPath === '/settings' ? (
            <SettingsPage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} />
          ) : (
            <SetupPage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} />
          )
        ) : (
          <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
        )
      ) : isConversationsRoute ? (
        isAuthenticated ? (
          <QueuePage
            onNavigate={navigate}
            onSignOut={handleSignOut}
            userEmail={userEmail}
            selectedConversationId={conversationId}
          />
        ) : (
          <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
        )
      ) : isQueuePage ? (
        isAuthenticated ? (
          <QueuePage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} />
        ) : (
          <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
        )
      ) : isLoginPage ? (
        <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
      ) : isAuthenticated ? (
        /* Signed In Wrong Address: Branded 404 with button back to the queue */
        <NotFoundPage onNavigate={navigate} />
      ) : (
        /* Signed Out: send them to login */
        <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
      )}
    </div>
    </SyncProvider>
  );
}