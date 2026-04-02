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
        // Cross-page anchor support if needed later, for now just scroll
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

interface HonoRouterProps {
  router: TrieRouter<React.FC<any>>;
}

export function HonoRouter({ router }: HonoRouterProps) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    // Basic support for `#` links cross-page
    const url = new URL(to, window.location.origin);
    
    if (url.pathname !== path) {
      window.history.pushState({}, '', to);
      setPath(url.pathname);
    }
    
    if (url.hash) {
      setTimeout(() => {
        const el = document.getElementById(url.hash.substring(1));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const match = router.match('GET', path);
  const Component = match && match[0].length > 0 ? match[0][0][0] : () => <div>م الصفحة غير موجودة - 404</div>;

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      <Component />
    </RouterContext.Provider>
  );
}
