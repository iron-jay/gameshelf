import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import type { AppKind } from '@/theme';

/**
 * Where each shelf lives, and the device token for it when the server asks for
 * one. Addresses are plain settings; tokens go to the keychain. Each server is
 * optional, so someone with only bookshelf sees only books.
 */
export type Server = { url: string | null; token: string | null };
export type Servers = Record<AppKind, Server>;

type State = {
  ready: boolean;
  servers: Servers;
  current: AppKind;
};

type ServersContext = State & {
  setCurrent: (kind: AppKind) => void;
  setUrl: (kind: AppKind, url: string | null) => Promise<void>;
  setToken: (kind: AppKind, token: string | null) => Promise<void>;
};

const Ctx = createContext<ServersContext | null>(null);

const urlKey = (kind: AppKind) => `shelf.url.${kind}`;
const tokenKey = (kind: AppKind) => `shelf.token.${kind}`;
const currentKey = 'shelf.current';

// The keychain is native-only; in a browser the token sits beside the address.
const secret = {
  get: (key: string) =>
    Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key),
  set: (key: string, value: string | null) => {
    if (Platform.OS === 'web') {
      return value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value);
    }
    return value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value);
  },
};

/**
 * What people type for a home server is rarely a clean origin: "192.168.1.20:3001",
 * a trailing slash, the API path pasted from the README. All of them mean the
 * same server.
 */
export function normaliseUrl(input: string): string | null {
  let url = input.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return url;
}

const empty: Servers = { books: { url: null, token: null }, games: { url: null, token: null } };

export function ServersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ ready: false, servers: empty, current: 'books' });

  useEffect(() => {
    (async () => {
      const kinds: AppKind[] = ['books', 'games'];
      const loaded = { ...empty };
      for (const kind of kinds) {
        loaded[kind] = {
          url: await AsyncStorage.getItem(urlKey(kind)),
          token: await secret.get(tokenKey(kind)).catch(() => null),
        };
      }
      const saved = (await AsyncStorage.getItem(currentKey)) as AppKind | null;
      // Open on whichever shelf was open last, if it is still set up.
      const current = saved && loaded[saved].url ? saved : loaded.books.url ? 'books' : loaded.games.url ? 'games' : 'books';
      setState({ ready: true, servers: loaded, current });
    })();
  }, []);

  const setCurrent = useCallback((kind: AppKind) => {
    setState((s) => ({ ...s, current: kind }));
    AsyncStorage.setItem(currentKey, kind);
  }, []);

  const setUrl = useCallback(async (kind: AppKind, url: string | null) => {
    if (url === null) await AsyncStorage.removeItem(urlKey(kind));
    else await AsyncStorage.setItem(urlKey(kind), url);
    // A token belongs to the server that issued it.
    await secret.set(tokenKey(kind), null);
    setState((s) => ({ ...s, servers: { ...s.servers, [kind]: { url, token: null } } }));
  }, []);

  const setToken = useCallback(async (kind: AppKind, token: string | null) => {
    await secret.set(tokenKey(kind), token);
    setState((s) => ({ ...s, servers: { ...s.servers, [kind]: { ...s.servers[kind], token } } }));
  }, []);

  const value = useMemo(() => ({ ...state, setCurrent, setUrl, setToken }), [state, setCurrent, setUrl, setToken]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServers(): ServersContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useServers outside ServersProvider');
  return ctx;
}
