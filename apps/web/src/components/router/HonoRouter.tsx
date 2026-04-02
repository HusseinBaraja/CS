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

export function Link({
  href,
  children,
  onClick,
  target,
  download,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useLocation();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);

    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      (target && target !== '_self') ||
      download ||
      !href
    ) {
      return;
    }

    if (href.startsWith('#')) {
      e.preventDefault();
      const el = document.getElementById(href.substring(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const url = new URL(href, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) {
      return;
    }

    e.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <a {...props} href={href} target={target} download={download} onClick={handleClick}>
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

