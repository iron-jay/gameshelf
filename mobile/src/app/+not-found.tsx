import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/controls';
import { T } from '@/components/text';
import { colors, gutter } from '@/theme';

export default function NotFound() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, justifyContent: 'center', padding: gutter * 2, gap: 12 }}>
      <T variant="display">Not on any shelf</T>
      <T variant="meta">There’s nothing at this address in the app.</T>
      <Button kind="primary" style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={() => router.replace('/')}>
        Back to your shelves
      </Button>
    </View>
  );
}
