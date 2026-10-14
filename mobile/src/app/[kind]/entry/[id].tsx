import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, Field, Segmented } from '@/components/controls';
import { Cover } from '@/components/cover';
import { RatingBars } from '@/components/rating';
import { PushedScreen, Section, useRouteKind } from '@/components/screen';
import { communityBand, Plank } from '@/components/shelf';
import { Loading, Problem } from '@/components/state';
import { T } from '@/components/text';
import {
  useDeleteRead,
  useEntry,
  useMeta,
  useReadAgain,
  useRemoveEntry,
  useTagEntry,
  useUpdateEntry,
  useUpdateRead,
} from '@/lib/api';
import { workHref } from '@/lib/routes';
import { completions } from '@/lib/shelves';
import type { BookExtra, Entry, EntryChange, GameExtra, Read } from '@/lib/types';
import { colors, gutter, type AppKind } from '@/theme';

export default function EntryScreen() {
  const kind = useRouteKind();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useEntry(kind, id);

  return (
    <PushedScreen kind={kind} back="Back to shelf">
      {entry.isPending ? (
        <Loading />
      ) : entry.isError ? (
        <Problem error={entry.error} retry={() => entry.refetch()} />
      ) : (
        <EntryView kind={kind} entry={entry.data} />
      )}
    </PushedScreen>
  );
}

function EntryView({ kind, entry }: { kind: AppKind; entry: Entry }) {
  const meta = useMeta(kind);
  const update = useUpdateEntry(kind);
  const change = (c: EntryChange) => update.mutate({ id: entry.id, change: c });

  const book = kind === 'books' ? (entry.extra as BookExtra) : null;
  const game = kind === 'games' ? (entry.extra as GameExtra) : null;
  const byline = book ? entry.creator : game?.platform;
  const secondLine = book
    ? [book.format === 'audiobook' ? 'Audiobook' : entry.subtitle !== 'Book' ? entry.subtitle : null, book.credit ? `read by ${book.credit}` : null]
    : [game?.community ? entry.subtitle : null, game?.community && entry.creator ? `by ${entry.creator}` : null, game?.parentWorkTitle ? `DLC for ${game.parentWorkTitle}` : null];

  function setShelf(shelf: string) {
    if (shelf === entry.shelf) return;
    // Played without a level is "saw the credits", the same default as the web.
    change(kind === 'games' && shelf === 'played' && !entry.completion ? { shelf, completion: 'credits' } : { shelf });
  }

  return (
    <View>
      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <Cover
            kind={kind}
            url={entry.coverUrl}
            title={entry.title}
            creator={entry.creator}
            width={132}
            rating={entry.rating}
            band={communityBand(kind, entry)}
          />
          <View style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
            <T variant={book ? 'bookTitle' : 'name'} accessibilityRole="header">
              {entry.title}
            </T>
            {byline ? (
              <T variant="body" style={{ marginTop: 6, fontSize: 17 }}>
                {byline}
              </T>
            ) : null}
            {secondLine.filter(Boolean).length ? (
              <T variant="meta" style={{ marginTop: 2 }}>
                {secondLine.filter(Boolean).join(' · ')}
              </T>
            ) : null}
            {entry.series ? (
              <T variant="meta" style={{ marginTop: 2 }}>
                {entry.series.name}
                {entry.series.position !== null ? ` #${entry.series.position}` : ''}
              </T>
            ) : null}
            <Pressable onPress={() => router.push(workHref(kind, entry.workSlug))} hitSlop={8} style={{ marginTop: 8 }}>
              <T variant="meta" style={{ color: colors.ink, textDecorationLine: 'underline' }}>
                {book ? 'About this book' : 'About this game'}
              </T>
            </Pressable>
          </View>
        </View>
        <Plank />
      </View>

      <View style={{ paddingHorizontal: gutter, marginTop: 22 }}>
        <Segmented scroll options={meta.data?.shelves ?? []} value={entry.shelf} onChange={setShelf} />
        {update.isError ? (
          <T variant="meta" style={{ color: colors.danger, marginTop: 8 }}>
            {update.error.message}
          </T>
        ) : null}
      </View>

      {kind === 'games' && entry.shelf === 'played' ? (
        <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
          <Segmented options={[...completions]} value={entry.completion} onChange={(completion) => change({ completion })} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: gutter, marginTop: 28 }}>
        <RatingBars value={entry.rating} onChange={(rating) => change({ rating })} />
      </View>

      {book ? <Reads entry={entry} /> : null}

      <Review key={`${entry.review}:${entry.reviewHasSpoilers}`} kind={kind} entry={entry} />

      <Tags kind={kind} entry={entry} />

      <Section title="Flags">
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button pressed={entry.isFavourite} onPress={() => change({ isFavourite: !entry.isFavourite })}>
            Favourite
          </Button>
          <Button pressed={entry.isPrivate} onPress={() => change({ isPrivate: !entry.isPrivate })}>
            Private
          </Button>
        </View>
      </Section>

      <Remove kind={kind} entry={entry} />
    </View>
  );
}

/** Reads, kept minimal: when you started and finished, and "read again". */
function Reads({ entry }: { entry: Entry }) {
  const again = useReadAgain();
  // Newest first: the read you are most likely to be dating is the latest.
  const reads = [...(entry.reads ?? [])].reverse();
  return (
    <Section
      title="Reads"
      right={
        <Button small onPress={() => again.mutate(entry.id)} busy={again.isPending}>
          Read again
        </Button>
      }>
      {reads.length === 0 ? <T variant="meta">No reads yet. Moving it to Reading or Finished records one.</T> : null}
      <View style={{ gap: 14 }}>
        {reads.map((read) => (
          // Keyed on the saved dates, so a save from elsewhere resets the fields.
          <ReadRow key={`${read.id}:${read.startedOn}:${read.finishedOn}`} read={read} />
        ))}
      </View>
    </Section>
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function ReadRow({ read }: { read: Read }) {
  const update = useUpdateRead();
  const remove = useDeleteRead();
  const [started, setStarted] = useState(read.startedOn ?? '');
  const [finished, setFinished] = useState(read.finishedOn ?? '');

  const dirty = started !== (read.startedOn ?? '') || finished !== (read.finishedOn ?? '');
  const valid = (started === '' || DATE.test(started)) && (finished === '' || DATE.test(finished));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={styles.read}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T variant="small" style={{ marginBottom: 4 }}>
            Started
          </T>
          <Field value={started} onChangeText={setStarted} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="small" style={{ marginBottom: 4 }}>
            Finished
          </T>
          <Field value={finished} onChangeText={setFinished} placeholder={read.startedOn ? 'Still reading' : 'YYYY-MM-DD'} keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {dirty ? (
          <Button small kind="primary" disabled={!valid} busy={update.isPending} onPress={() => update.mutate({ id: read.id, startedOn: started || null, finishedOn: finished || null })}>
            Save dates
          </Button>
        ) : !read.finishedOn ? (
          <Button small onPress={() => setFinished(today)}>
            Finished today
          </Button>
        ) : null}
        <Button small kind="quiet" busy={remove.isPending} onPress={() => remove.mutate(read.id)}>
          Delete read
        </Button>
      </View>
      {!valid ? <T variant="small" style={{ marginTop: 4 }}>Dates are year-month-day, like {today}.</T> : null}
      {update.isError ? <T variant="small" style={{ color: colors.danger, marginTop: 4 }}>{update.error.message}</T> : null}
    </View>
  );
}

function Review({ kind, entry }: { kind: AppKind; entry: Entry }) {
  const update = useUpdateEntry(kind);
  const [text, setText] = useState(entry.review ?? '');
  const [spoilers, setSpoilers] = useState(entry.reviewHasSpoilers);
  const dirty = text !== (entry.review ?? '') || spoilers !== entry.reviewHasSpoilers;

  return (
    <Section title="Review">
      <Field multiline value={text} onChangeText={setText} placeholder="What did you make of it?" />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button
          kind={dirty ? 'primary' : 'secondary'}
          disabled={!dirty}
          busy={update.isPending}
          onPress={() => update.mutate({ id: entry.id, change: { review: text.trim() ? text : null, reviewHasSpoilers: spoilers } })}>
          Save review
        </Button>
        <Button pressed={spoilers} onPress={() => setSpoilers(!spoilers)}>
          Has spoilers
        </Button>
      </View>
    </Section>
  );
}

function Tags({ kind, entry }: { kind: AppKind; entry: Entry }) {
  const tag = useTagEntry(kind);
  const [name, setName] = useState('');
  function addTag() {
    const n = name.trim();
    if (!n) return;
    tag.mutate({ id: entry.id, name: n, on: true }, { onSuccess: () => setName('') });
  }
  return (
    <Section title="Tags">
      {entry.tags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {entry.tags.map((t) => (
            <Chip key={t.id} label={`${t.name}  ×`} on onPress={() => tag.mutate({ id: entry.id, name: t.name, on: false })} />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field value={name} onChangeText={setName} placeholder="Add a tag" onSubmitEditing={addTag} returnKeyType="done" style={{ flex: 1 }} />
        <Button onPress={addTag} busy={tag.isPending} disabled={!name.trim()}>
          Add
        </Button>
      </View>
    </Section>
  );
}

/** Two steps, as on the web: the first press only asks. */
function Remove({ kind, entry }: { kind: AppKind; entry: Entry }) {
  const remove = useRemoveEntry(kind);
  const [asking, setAsking] = useState(false);
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 40 }}>
      {asking ? (
        <View style={styles.confirm}>
          <T variant="body">
            Take {entry.title} off your shelf? Its rating, review, {kind === 'books' ? 'reads' : 'plays'} and tags go with it.
            The {kind === 'books' ? 'book' : 'game'} stays on the server.
          </T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Button
              kind="danger"
              busy={remove.isPending}
              onPress={() => remove.mutate(entry.id, { onSuccess: () => (router.canGoBack() ? router.back() : router.replace('/')) })}>
              Remove it
            </Button>
            <Button onPress={() => setAsking(false)}>Keep it</Button>
          </View>
        </View>
      ) : (
        <Button kind="quiet" style={{ alignSelf: 'flex-start' }} onPress={() => setAsking(true)}>
          Remove from shelf
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingTop: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, paddingHorizontal: 8 },
  read: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingBottom: 14 },
  confirm: { backgroundColor: colors.band, borderRadius: 12, padding: 14 },
});
