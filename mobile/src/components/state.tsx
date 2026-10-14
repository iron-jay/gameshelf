import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/lib/api';
import { colors, gutter } from '@/theme';

import { Button } from './controls';
import { T } from './text';

export function Loading() {
  return (
    <View style={styles.box}>
      <ActivityIndicator color={colors.inkDim} />
    </View>
  );
}

/** What went wrong, said plainly, with the one thing to do about it. */
export function Problem({ error, retry }: { error: ApiError | null; retry?: () => void }) {
  const signIn = error?.status === 401;
  const setUp = error?.code === 'not_set_up';
  return (
    <View style={styles.box}>
      <T variant="strong" style={{ textAlign: 'center' }}>
        {signIn ? 'Signed out' : setUp ? 'Not set up yet' : error?.code === 'offline' ? 'Out of reach' : 'That didn’t work'}
      </T>
      <T variant="meta" style={{ textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
        {signIn ? 'This server wants you to sign in again.' : (error?.message ?? 'Something went wrong.')}
      </T>
      {signIn || setUp ? (
        <Button kind="primary" onPress={() => router.navigate('/more')}>
          {signIn ? 'Sign in' : 'Set up'}
        </Button>
      ) : retry ? (
        <Button onPress={retry}>Try again</Button>
      ) : null}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.box}>
      <T variant="strong" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {body ? (
        <T variant="meta" style={{ textAlign: 'center', marginTop: 6 }}>
          {body}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 48, paddingHorizontal: gutter * 2, alignItems: 'center', justifyContent: 'center' },
});
