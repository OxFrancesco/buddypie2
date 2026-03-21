'use client';

import { use, useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, createPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) {
    return cached as Promise<T>;
  }

  const promise = createPromise();
  cache.set(key, promise);
  return promise;
}

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <MermaidContent chart={chart} />;
}

function MermaidContent({ chart }: { chart: string }) {
  const diagramId = useId().replace(/:/g, '');
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(
    cachePromise('mermaid', () => import('mermaid')),
  );

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 0 auto;',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () =>
      mermaid.render(`buddy-pie-mermaid-${diagramId}`, chart.replaceAll('\\n', '\n')),
    ),
  );

  return (
    <div
      className="mermaid-diagram my-6 overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4"
      ref={(container) => {
        if (container) {
          bindFunctions?.(container);
        }
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
