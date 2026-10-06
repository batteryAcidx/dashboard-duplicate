import { useEffect, useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { QueuePage } from './pages/QueuePage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('wedgescale_auth') === 'true';
  });

  const [userEmail, setUserEmail] = useState<string>(() => {
    if (typeof window === 'undefined') return 'contractor@roofingcompany.com';
    return localStorage.getItem('wedgescale_user_email') || 'contractor@roofingcompany.com';
  });

  const getCleanPath = (rawPath: string) => {
    const withoutQuery = rawPath.split('?')[0];
    const withoutHash = withoutQuery.replace(/^#/, '');
    const clean = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
    return clean || '/';
  };

  const getInitialPath = () => {
    if (typeof window === 'undefined') return '/';
    const hash = window.location.hash;
    if (hash && hash !== '#') {
      return getCleanPath(hash);
    }
    return getCleanPath(window.location.pathname);
  };

  const [currentPath, setCurrentPath] = useState<string>(getInitialPath);

  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash;
      const path = hash && hash !== '#' ? getCleanPath(hash) : getCleanPath(window.location.pathname);
      setCurrentPath(path);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigate = (to: string) => {
    const clean = getCleanPath(to);
    window.history.pushState({}, '', to);
    setCurrentPath(clean);
  };

  const handleSignIn = (email: string) => {
    setIsAuthenticated(true);
    setUserEmail(email);
    localStorage.setItem('wedgescale_auth', 'true');
    localStorage.setItem('wedgescale_user_email', email);
    navigate('/queue');
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('wedgescale_auth');
    navigate('/login');
  };

  // Check explicit direct 404 preview route
  const isDirect404Preview = currentPath === '/404' || currentPath === '/not-found';

  // Check known public routes
  const isKnownPublicRoute =
    currentPath === '/' ||
    currentPath === '/login' ||
    currentPath === '/forgot-password' ||
    currentPath === '/set-password' ||
    isDirect404Preview;

  const isQueueRoute =
    currentPath === '/queue' || currentPath === '/dashboard';

  // Handle wrong addresses according to role specification:
  // If Signed out and path is not a known public route: send them directly to login with no page at all.
  if (!isAuthenticated && !isKnownPublicRoute) {
    window.history.replaceState({}, '', '/');
    return (
      <div className="min-h-screen bg-[#0e1322] text-[#dee1f7] font-['Inter'] selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col w-full max-w-full overflow-x-hidden">
        <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e1322] text-[#dee1f7] font-['Inter'] selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col w-full max-w-full overflow-x-hidden">
      {/* Route: Direct 404 preview or Signed in 404 */}
      {isDirect404Preview ? (
        <NotFoundPage onNavigate={navigate} />
      ) : currentPath === '/forgot-password' ? (
        <ForgotPasswordPage onNavigate={navigate} />
      ) : currentPath === '/set-password' ? (
        <SetPasswordPage onNavigate={navigate} />
      ) : isQueueRoute ? (
        isAuthenticated ? (
          <QueuePage onNavigate={navigate} onSignOut={handleSignOut} userEmail={userEmail} />
        ) : (
          <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
        )
      ) : currentPath === '/' || currentPath === '/login' ? (
        <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
      ) : isAuthenticated ? (
        /* Signed In Wrong Address: Branded 404 with button back to the queue */
        <NotFoundPage onNavigate={navigate} />
      ) : (
        /* Signed Out: send them to login */
        <LoginPage onNavigate={navigate} onSignIn={handleSignIn} />
      )}
    </div>
  );
}
