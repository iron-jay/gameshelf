import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { PushedScreen, useRouteKind } from '@/components/screen';
import { Loading, Problem } from '@/components/state';
import { useEdition, useVersion } from '@/lib/api';
import { addHref, entryHref } from '@/lib/routes';

/**
 * An edition or version by id, from a search result or a work page: your
 * entry for it if you have one, otherwise the add sheet for exactly it.
 */
export default function VersionScreen() {
  const kind = useRouteKind();
  const { id } = useLocalSearchParams<{ id: string }>();
  const edition = useEdition(kind === 'books' ? id : undefined);
  const version = useVersion(kind === 'games' ? id : undefined);
  const q = kind === 'books' ? edition : version;

  useEffect(() => {
    if (edition.data) {
      const e = edition.data;
      router.replace(
        e.entryId
          ? entryHref('books', e.entryId)
          : addHref('books', {
              source: 'edition',
              editionId: e.id,
              title: e.work.title,
              subtitle: [e.work.authors.join(', '), e.name].filter(Boolean).join(' · '),
              cover: e.coverUrl ?? '',
            }),
      );
    }
  }, [edition.data]);

  useEffect(() => {
    if (version.data) {
      const v = version.data;
      router.replace(
        v.entryId
          ? entryHref('games', v.entryId)
          : addHref('games', { source: 'version', versionId: v.id, title: v.work.title, subtitle: [v.platform, v.community ? v.name : null].filter(Boolean).join(' · '), cover: v.coverUrl ?? '' }),
      );
    }
  }, [version.data]);

  return (
    <PushedScreen kind={kind}>{q.isError ? <Problem error={q.error} retry={() => q.refetch()} /> : <Loading />}</PushedScreen>
  );
}
