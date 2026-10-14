import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KindProvider } from '@/components/accent';
import { Button } from '@/components/controls';
import { T } from '@/components/text';
import { colors, gutter } from '@/theme';

/**
 * A book's barcode is its ISBN (EAN-13, starting 978 or 979). Scanning one
 * hands it to search, which goes straight to that edition, exactly as typing
 * it would.
 */
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const done = useRef(false);

  function onScan({ data }: BarcodeScanningResult) {
    const digits = data.replace(/\D/g, '');
    if (done.current || !/^97[89]\d{10}$/.test(digits)) return;
    done.current = true;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
    router.navigate({ pathname: '/search', params: { q: digits } });
  }

  return (
    <KindProvider kind="books">
      <View style={{ flex: 1, backgroundColor: colors.well }}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
            onBarcodeScanned={onScan}
          />
        ) : (
          <View style={styles.ask}>
            <T variant="heading" style={{ textAlign: 'center' }}>
              Scan a book’s barcode
            </T>
            <T variant="meta" style={{ textAlign: 'center', marginVertical: 12 }}>
              {permission && !permission.canAskAgain
                ? 'Camera access is off for this app. Turn it on in your phone’s settings to scan.'
                : 'The camera is only used to read the ISBN on the back cover.'}
            </T>
            {permission?.canAskAgain !== false ? (
              <Button kind="primary" onPress={requestPermission}>
                Use the camera
              </Button>
            ) : null}
          </View>
        )}
        <View style={[styles.frame]} pointerEvents="none" />
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <T variant="meta" style={{ color: colors.ink, textAlign: 'center', marginBottom: 12 }}>
            Hold the barcode inside the frame.
          </T>
          <Button onPress={() => router.back()}>Cancel</Button>
        </View>
      </View>
    </KindProvider>
  );
}

const styles = StyleSheet.create({
  ask: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: gutter * 2 },
  frame: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '36%',
    height: 120,
    borderWidth: 2,
    borderColor: colors.sticker,
    borderRadius: 8,
    opacity: 0.8,
  },
  bottom: { position: 'absolute', left: gutter, right: gutter, bottom: 0 },
});
