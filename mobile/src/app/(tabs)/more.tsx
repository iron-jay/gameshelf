import Constants from 'expo-constants';
import { Linking, Pressable, ScrollView, View } from 'react-native';

import { Header } from '@/components/header';
import { ServerSetup } from '@/components/server-setup';
import { Section } from '@/components/screen';
import { T } from '@/components/text';
import { useServers } from '@/lib/servers';
import { colors, gutter } from '@/theme';

/**
 * Where the shelves are, and signing in where a server asks for it. The rest
 * of Settings (import, export, cover art, account) stays on the web, which
 * these links open.
 */
export default function MoreScreen() {
  const { servers } = useServers();
  const web = [
    servers.books.url && { label: 'bookshelf settings', url: `${servers.books.url}/settings` },
    servers.books.url && { label: 'Covers to review (books)', url: `${servers.books.url}/art` },
    servers.games.url && { label: 'gameshelf settings', url: `${servers.games.url}/settings` },
    servers.games.url && { label: 'Covers to review (games)', url: `${servers.games.url}/art` },
  ].filter((x): x is { label: string; url: string } => !!x);

  return (
    <View style={{ flex: 1 }}>
      <Header />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
        <Section title="Your servers">
          <T variant="meta" style={{ marginBottom: 18 }}>
            The addresses you open each app at in a browser. Either can be left empty.
          </T>
          <ServerSetup />
        </Section>
        {web.length ? (
          <Section title="On the web">
            <T variant="meta" style={{ marginBottom: 8 }}>
              Import, export, cover art and your account live in the browser.
            </T>
            {web.map((w) => (
              <Pressable key={w.url} onPress={() => Linking.openURL(w.url)} style={{ paddingVertical: 10 }}>
                <T variant="body" style={{ textDecorationLine: 'underline' }}>
                  {w.label}
                </T>
              </Pressable>
            ))}
          </Section>
        ) : null}
        <T variant="small" style={{ paddingHorizontal: gutter, marginTop: 36, color: colors.inkDim }}>
          Shelf {Constants.expoConfig?.version ?? ''}
        </T>
      </ScrollView>
    </View>
  );
}
