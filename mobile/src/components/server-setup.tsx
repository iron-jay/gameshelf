import { useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError, request, useMeta } from '@/lib/api';
import { normaliseUrl, useServers } from '@/lib/servers';
import type { Meta, User } from '@/lib/types';
import { accents, colors, type AppKind } from '@/theme';

import { KindProvider } from './accent';
import { Button, Field } from './controls';
import { T } from './text';

const appName: Record<AppKind, Meta['app']> = { books: 'bookshelf', games: 'gameshelf' };

/** Both servers' addresses, each checked against /meta before it is kept. */
export function ServerSetup() {
  return (
    <View style={{ gap: 28 }}>
      <KindProvider kind="books">
        <ServerRow kind="books" />
      </KindProvider>
      <KindProvider kind="games">
        <ServerRow kind="games" />
      </KindProvider>
    </View>
  );
}

function ServerRow({ kind }: { kind: AppKind }) {
  const { servers, setUrl, setToken, setCurrent, current } = useServers();
  const server = servers[kind];
  const client = useQueryClient();
  const [draft, setDraft] = useState(server.url ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const meta = useMeta(kind);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function connect() {
    const url = normaliseUrl(draft);
    setMessage(null);
    if (!url) {
      await setUrl(kind, null);
      return;
    }
    setBusy(true);
    try {
      const meta = await request<Meta>({ url, token: null }, 'GET', '/meta');
      if (meta.app !== appName[kind]) {
        setMessage(`That address is ${meta.app}, not ${appName[kind]}.`);
        return;
      }
      await setUrl(kind, url);
      setDraft(url);
      client.invalidateQueries({ queryKey: [kind] });
      if (!servers.books.url && !servers.games.url) setCurrent(kind);
      else if (!servers[current].url) setCurrent(kind);
      setNeedsSignIn(meta.authRequired);
      setMessage(meta.authRequired ? 'Found it. It wants you to sign in.' : 'Connected.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!server.url) return;
    setBusy(true);
    setMessage(null);
    try {
      const deviceName = Device.deviceName ?? Device.modelName ?? 'Phone';
      const { token } = await request<{ token: string; user: User }>(server, 'POST', '/auth/token', {
        username,
        password,
        deviceName,
      });
      await setToken(kind, token);
      setPassword('');
      setNeedsSignIn(false);
      setMessage('Signed in.');
      client.invalidateQueries({ queryKey: [kind] });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    // Best effort: forgetting the token here matters more than the server hearing about it.
    await request(server, 'DELETE', '/auth/token').catch(() => {});
    await setToken(kind, null);
    setMessage('Signed out.');
    client.invalidateQueries({ queryKey: [kind] });
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <View style={[styles.swatch, { backgroundColor: accents[kind].accent }]} />
        <T variant="heading">{appName[kind]}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={kind === 'books' ? '192.168.1.20:3001' : '192.168.1.20:3000'}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={connect}
          style={{ flex: 1 }}
          accessibilityLabel={`${appName[kind]} address`}
        />
        <Button onPress={connect} busy={busy && !needsSignIn}>
          {server.url && normaliseUrl(draft) === server.url ? 'Check' : 'Save'}
        </Button>
      </View>

      {needsSignIn && server.url ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          <Field value={username} onChangeText={setUsername} placeholder="Name" autoCapitalize="none" autoCorrect={false} />
          <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry onSubmitEditing={signIn} />
          <Button kind="primary" onPress={signIn} busy={busy}>
            Sign in
          </Button>
        </View>
      ) : null}

      {message ? (
        <T variant="meta" style={{ marginTop: 8 }}>
          {message}
        </T>
      ) : null}

      {server.token ? (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          <T variant="meta">Signed in on this phone.</T>
          <Button kind="quiet" small onPress={signOut}>
            Sign out
          </Button>
        </View>
      ) : null}
      {server.url && !needsSignIn && meta.data?.authRequired ? (
        <Button kind="quiet" small style={{ alignSelf: 'flex-start', marginTop: 4 }} onPress={() => setNeedsSignIn(true)}>
          {server.token ? 'Sign in as someone else' : 'Sign in'}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.line },
});
