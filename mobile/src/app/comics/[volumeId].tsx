import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Cover } from '@/components/cover';
import { PushedScreen } from '@/components/screen';
import { Loading, Problem } from '@/components/state';
import { T } from '@/components/text';
import { useComicVolume } from '@/lib/api';
import { addHref, versionHref } from '@/lib/routes';
import { colors, gutter } from '@/theme';

/** A Comic Vine volume's issues, to pick the one you have. One issue is one book. */
export default function ComicVolumeScreen() {
  const { volumeId } = useLocalSearchParams<{ volumeId: string }>();
  const volume = useComicVolume(volumeId);

  return (
    <PushedScreen kind="books">
      {volume.isPending ? (
        <Loading />
      ) : volume.isError ? (
        <Problem error={volume.error} retry={() => volume.refetch()} />
      ) : (
        <View>
          <View style={{ paddingHorizontal: gutter }}>
            <T variant="display">{volume.data.name}</T>
            <T variant="meta" style={{ marginTop: 4 }}>
              {[volume.data.publisher, volume.data.startYear, `${volume.data.issueCount} issues`].filter(Boolean).join(' · ')}
            </T>
            {volume.data.issueCount > volume.data.issues.length ? (
              <T variant="small" style={{ marginTop: 4 }}>
                The first {volume.data.issues.length} are shown.
              </T>
            ) : null}
          </View>
          <View style={{ marginTop: 14 }}>
            {volume.data.issues.map((issue) => (
              <Pressable
                key={issue.comicvineIssueId}
                accessibilityLabel={issue.title}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.band }]}
                onPress={() =>
                  router.push(
                    issue.editionId
                      ? versionHref('books', issue.editionId)
                      : addHref('books', {
                          source: 'comic',
                          comicvineIssueId: String(issue.comicvineIssueId),
                          title: issue.title,
                          subtitle: [volume.data.publisher, issue.year].filter(Boolean).join(' · '),
                          cover: issue.coverUrl ?? '',
                        }),
                  )
                }>
                <Cover kind="books" url={issue.coverUrl} title={issue.title} width={52} />
                <View style={{ flex: 1 }}>
                  <T variant="strong" numberOfLines={2}>
                    {[issue.issueNumber ? `#${issue.issueNumber}` : null, issue.name].filter(Boolean).join(' ')}
                  </T>
                  {issue.year ? <T variant="small">{issue.year}</T> : null}
                </View>
                {issue.editionId ? <T variant="small">On your shelf</T> : null}
              </Pressable>
            ))}
          </View>
          {/* Comic Vine's terms ask for a link back wherever its data is shown. */}
          <Pressable onPress={() => Linking.openURL(volume.data.pageUrl)} style={{ padding: gutter }}>
            <T variant="small">
              From <T variant="small" style={{ textDecorationLine: 'underline' }}>Comic Vine</T>.
            </T>
          </Pressable>
        </View>
      )}
    </PushedScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: gutter, paddingVertical: 8 },
});
