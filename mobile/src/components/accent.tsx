import { createContext, useContext, type ReactNode } from 'react';

import { accents, type AppKind } from '@/theme';

/**
 * Which shelf a screen belongs to. The tabs follow the switcher; a pushed
 * detail screen sets its own from its route, so a book opened from search
 * stays sage even while the games tab is behind it.
 */
const KindContext = createContext<AppKind>('books');

export function KindProvider({ kind, children }: { kind: AppKind; children: ReactNode }) {
  return <KindContext.Provider value={kind}>{children}</KindContext.Provider>;
}

export function useKind(): AppKind {
  return useContext(KindContext);
}

export function useAccent() {
  return accents[useKind()];
}
