import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
} from '@expo-google-fonts/newsreader';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import ArchivoBold from '@/assets/fonts/Archivo-Bold.ttf';
import ArchivoDisplay from '@/assets/fonts/Archivo-Display.ttf';
import ArchivoMedium from '@/assets/fonts/Archivo-Medium.ttf';
import ArchivoNarrow from '@/assets/fonts/Archivo-Narrow.ttf';
import ArchivoNarrowBold from '@/assets/fonts/Archivo-NarrowBold.ttf';
import ArchivoNarrowSemiBold from '@/assets/fonts/Archivo-NarrowSemiBold.ttf';
import ArchivoRegular from '@/assets/fonts/Archivo-Regular.ttf';
import ArchivoSemiBold from '@/assets/fonts/Archivo-SemiBold.ttf';
import { ServersProvider, useServers } from '@/lib/servers';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.ground, card: colors.band, text: colors.ink, border: colors.line },
};

function Root() {
  const { ready } = useServers();
  const [fontsLoaded] = useFonts({
    'Archivo-Display': ArchivoDisplay,
    'Archivo-Regular': ArchivoRegular,
    'Archivo-Medium': ArchivoMedium,
    'Archivo-SemiBold': ArchivoSemiBold,
    'Archivo-Bold': ArchivoBold,
    'Archivo-Narrow': ArchivoNarrow,
    'Archivo-NarrowSemiBold': ArchivoNarrowSemiBold,
    'Archivo-NarrowBold': ArchivoNarrowBold,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    IBMPlexMono_500Medium,
  });

  const loaded = fontsLoaded && ready;
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.ground },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="[kind]/add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            // A home server that is off is off; asking three times only delays saying so.
            retry: (count, error) => count < 1 && (error as { code?: string })?.code === 'offline',
          },
        },
      }),
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
      <ThemeProvider value={theme}>
        <QueryClientProvider client={client}>
          <ServersProvider>
            <StatusBar style="light" />
            <Root />
          </ServersProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
