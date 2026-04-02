import React, { createContext, useContext, useEffect, useState } from 'react';
import { TrieRouter } from 'hono/router/trie-router';

interface RouterContextValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue>({
  path: '/',
  navigate: () => {},
});

export function useLocation() {
  return useContext(RouterContext);
}

export function Link({ href, children, className, onClick }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useLocation();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    
    // Allow default behavior for external links or modifiers
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || href?.startsWith('http') || href?.startsWith('mailto')) {
      return;
    }
    
    e.preventDefault();
    if (href) {
      if (href.startsWith('#')) {
        // In-page anchor scroll
        const el = document.getElementById(href.substring(1));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate(href);
      }
    }
  };

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}

/**
 * RouterProvider wraps its children with the navigation context.
 * Must be placed above any component that uses useLocation() or Link.
 */
export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    const url = new URL(to, window.location.origin);
    
    if (url.pathname !== path) {
      window.history.pushState({}, '', to);
      setPath(url.pathname);
    }
    
    if (url.hash) {
      const id = url.hash.substring(1);
      let attempts = 0;
      const maxAttempts = 10;
      const tryScroll = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(tryScroll, 50);
        }
      };
      // Start after a frame so React can flush the new route
      requestAnimationFrame(tryScroll);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

/**
 * RouteView matches the current path against the router and renders the
 * corresponding page component.
 */
export function RouteView({ router }: { router: TrieRouter<React.FC<any>> }) {
  const { path } = useLocation();
  const match = router.match('GET', path);
  const Component = match && match[0].length > 0 ? match[0][0][0] : () => <div>الصفحة غير موجودة - 404</div>;

  return <Component />;
}

