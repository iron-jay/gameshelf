import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAccent } from '@/components/accent';
import { Button, Chip, Field, Segmented } from '@/components/controls';
import { Cover } from '@/components/cover';
import { PushedScreen, Section, useRouteKind } from '@/components/screen';
import { T } from '@/components/text';
import { useAddEntry, useMeta, useOlWork } from '@/lib/api';
import { entryHref, type AddParams } from '@/lib/routes';
import type { OlEdition } from '@/lib/types';
import { colors, gutter, type AppKind } from '@/theme';

const FORMAT_KEY = 'shelf.lastFormat';

/**
 * The one add flow, on a phone: what it is, Book or Audiobook (books), the
 * platform (games), which edition if you care, and the shelf. Nothing is
 * written until Add. The default shelf is "to read" or the backlog.
 */
export default function AddScreen() {
  const kind = useRouteKind();
  const p = useLocalSearchParams<AddParams & { kind: string }>();
  return (
    <PushedScreen kind={kind} modal>
      <AddForm kind={kind} p={p} />
    </PushedScreen>
  );
}

function AddForm({ kind, p }: { kind: AppKind; p: AddParams }) {
  const meta = useMeta(kind);
  const add = useAddEntry(kind);
  const [shelf, setShelf] = useState(p.shelf || (kind === 'books' ? 'tbr' : 'backlog'));
  const [format, setFormat] = useState<'book' | 'audiobook'>(p.format === 'audiobook' ? 'audiobook' : 'book');
  const [editionKey, setEditionKey] = useState<string | null>(p.olEditionKey || null);
  const [credit, setCredit] = useState('');
  const platforms = useMemo<{ id: number; name: string }[]>(() => {
    try {
      return p.platforms ? JSON.parse(p.platforms) : [];
    } catch {
      return [];
    }
  }, [p.platforms]);
  const [platformId, setPlatformId] = useState<number | null>(p.platformId ? Number(p.platformId) : (platforms[0]?.id ?? null));

  const offersFormat = kind === 'books' && (p.source === 'ol' || p.source === 'hardcover');

  // Book or Audiobook defaults to whichever was picked last, unless an ISBN already said.
  useEffect(() => {
    if (!offersFormat || p.format) return;
    AsyncStorage.getItem(FORMAT_KEY).then((v) => v === 'audiobook' && setFormat('audiobook'));
  }, [offersFormat, p.format]);

  function chooseFormat(f: 'book' | 'audiobook') {
    setFormat(f);
    AsyncStorage.setItem(FORMAT_KEY, f);
    if (!p.olEditionKey) setEditionKey(null);
  }

  function body(): Record<string, unknown> {
    switch (p.source) {
      case 'ol':
        return {
          olWorkKey: p.olWorkKey,
          ...(editionKey ? { olEditionKey: editionKey } : {}),
          format,
          ...(format === 'audiobook' && credit.trim() ? { credit: credit.trim() } : {}),
          ...(p.isbn && editionKey === p.olEditionKey ? { isbn: p.isbn } : {}),
          shelf,
        };
      case 'hardcover':
        return { hardcoverId: Number(p.hardcoverId), format, shelf };
      case 'comic':
        return { comicvineIssueId: Number(p.comicvineIssueId), shelf };
      case 'edition':
        return { editionId: p.editionId, shelf };
      case 'version':
        return { versionId: p.versionId, shelf };
      case 'igdb':
        return { igdbId: Number(p.igdbId), ...(platformId ? { platformId } : {}), shelf };
    }
  }

  function submit() {
    add.mutate(body(), {
      onSuccess: (card) => {
        router.replace(entryHref(kind, card.id));
      },
    });
  }

  return (
    <View>
      <View style={styles.head}>
        <Cover kind={kind} url={p.cover || null} title={p.title} width={96} />
        <View style={{ flex: 1 }}>
          <T variant={kind === 'books' ? 'bookTitle' : 'name'} style={{ fontSize: 24, lineHeight: 28 }}>
            {p.title}
          </T>
          {p.subtitle ? (
            <T variant="meta" style={{ marginTop: 4 }}>
              {p.subtitle}
            </T>
          ) : null}
          {p.isbn ? (
            <T variant="mono" style={{ marginTop: 6 }}>
              ISBN {p.isbn}
            </T>
          ) : null}
        </View>
      </View>

      {offersFormat ? (
        <Section title="Book or audiobook">
          <Segmented
            options={[
              { key: 'book', label: 'Book' },
              { key: 'audiobook', label: 'Audiobook' },
            ]}
            value={format}
            onChange={chooseFormat}
          />
          {format === 'audiobook' && !editionKey ? (
            <Field value={credit} onChangeText={setCredit} placeholder="Read by (optional)" style={{ marginTop: 10 }} />
          ) : null}
        </Section>
      ) : null}

      {kind === 'games' && platforms.length > 0 ? (
        <Section title="Platform">
          <View style={styles.chips}>
            {platforms.map((pl) => (
              <Chip key={pl.id} label={pl.name} on={platformId === pl.id} onPress={() => setPlatformId(pl.id)} />
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Shelf">
        <Segmented scroll options={meta.data?.shelves ?? []} value={shelf} onChange={setShelf} />
      </Section>

      <View style={{ paddingHorizontal: gutter, marginTop: 28 }}>
        <Button kind="primary" onPress={submit} busy={add.isPending}>
          Add to shelf
        </Button>
        {add.isError ? (
          <T variant="meta" style={{ marginTop: 10, color: colors.danger }}>
            {add.error.message}
          </T>
        ) : null}
      </View>

      {p.source === 'ol' && p.olWorkKey && !p.olEditionKey ? (
        <EditionPicker olWorkKey={p.olWorkKey} format={format} value={editionKey} onChange={setEditionKey} />
      ) : null}
    </View>
  );
}

/**
 * Open Library's editions for the work, filtered by Book or Audiobook, newest
 * first, with year and language. "Any edition" makes a plain one.
 */
function EditionPicker({
  olWorkKey,
  format,
  value,
  onChange,
}: {
  olWorkKey: string;
  format: 'book' | 'audiobook';
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  const work = useOlWork(olWorkKey);
  const [lang, setLang] = useState<string | null>(null);
  const editions = (work.data?.editions ?? []).filter((e) => e.format === format);
  const languages = [...new Set(editions.map((e) => e.language).filter((l): l is string => !!l))];
  const shown = lang ? editions.filter((e) => e.language === lang) : editions;

  return (
    <Section title="Edition" right={work.data ? <T variant="small">{editions.length} found</T> : null}>
      <T variant="meta" style={{ marginBottom: 10 }}>
        Pick the one in your hands, or leave it at any edition.
      </T>
      {languages.length > 1 ? (
        <View style={[styles.chips, { marginBottom: 10 }]}>
          {languages.slice(0, 8).map((l) => (
            <Chip key={l} label={l} on={lang === l} onPress={() => setLang(lang === l ? null : l)} />
          ))}
        </View>
      ) : null}
      <EditionRow label={format === 'audiobook' ? 'Any audiobook' : 'Any edition'} detail="A plain one, named by format" on={value === null} onPress={() => onChange(null)} />
      {work.isPending ? <ActivityIndicator color={colors.inkDim} style={{ marginTop: 16 }} /> : null}
      {work.isError ? (
        <T variant="meta" style={{ marginTop: 10 }}>
          Couldn’t load the editions: {work.error.message}
        </T>
      ) : null}
      {shown.slice(0, 60).map((e) => (
        <EditionRow
          key={e.olEditionKey}
          label={editionLabel(e)}
          detail={[e.language, e.isbn ? `ISBN ${e.isbn}` : null, e.narrators.length ? `read by ${e.narrators.slice(0, 2).join(', ')}` : null]
            .filter(Boolean)
            .join(' · ')}
          on={value === e.olEditionKey}
          shelved={!!e.editionId}
          onPress={() => onChange(e.olEditionKey)}
        />
      ))}
    </Section>
  );
}

function editionLabel(e: OlEdition): string {
  return [e.physicalFormat, e.year].filter(Boolean).join(', ') || e.title;
}

function EditionRow({ label, detail, on, shelved, onPress }: { label: string; detail?: string; on: boolean; shelved?: boolean; onPress: () => void }) {
  const { accent } = useAccent();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.edition, on && { borderColor: accent }]}>
      <View style={{ flex: 1 }}>
        <T variant={on ? 'strong' : 'body'}>{label}</T>
        {detail ? <T variant="small">{detail}</T> : null}
      </View>
      {shelved ? <T variant="small">On your shelf</T> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 16, paddingHorizontal: gutter, paddingTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  edition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
});
