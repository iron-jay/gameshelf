/**
 * Drizzle mirror of schema.sql. That file stays the readable source of truth
 * for the design; this one is what the app and drizzle-kit read.
 *
 * Objects drizzle-kit cannot express — the extensions, the trigram index
 * operator class, the touch_updated_at trigger and the entry_cards view — are
 * carried in the migration by hand. `entryCards` below is declared `.existing()`
 * so drizzle never tries to own it.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------- enums

export const sourceKind = pgEnum("source_kind", ["igdb", "local"]);

export const versionKind = pgEnum("version_kind", [
  "original",
  "port",
  "remaster",
  "remake",
  "compilation",
  "romhack",
  "translation",
  "decomp_port",
  "recomp",
  "mod",
  "homebrew",
  "other",
]);

export const workKind = pgEnum("work_kind", [
  "main_game",
  "dlc",
  "expansion",
  "standalone_expansion",
  "episode",
  "season",
  "bundle",
]);

export const artSource = pgEnum("art_source", ["igdb", "steamgriddb", "upload"]);

export const logStatus = pgEnum("log_status", [
  "backlog",
  "playing",
  "played",
  "dropped",
  "shelved",
  "wishlist",
]);

export const completionLevel = pgEnum("completion_level", [
  "unfinished",
  "credits",
  "completed",
  "mastered",
]);

/**
 * Version kinds that are official releases. Everything else is a community
 * release: it gets the label band and never inherits the parent work's art.
 * Kept in one place so those two rules cannot drift apart.
 */
export const OFFICIAL_VERSION_KINDS = [
  "original",
  "port",
  "remaster",
  "remake",
  "compilation",
] as const;

// ---------------------------------------------------------------- users

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ------------------------------------------------------------ platforms

export const platforms = pgTable("platforms", {
  id: serial("id").primaryKey(),
  igdbId: integer("igdb_id").unique(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  source: sourceKind("source").notNull().default("igdb"),
});

// ----------------------------------------------------------- igdb tokens

/**
 * Twitch client-credentials tokens last around 60 days. Holding one row here
 * rather than in memory means a container restart does not burn a fresh token,
 * and a 401 can force a refresh without coordinating across processes.
 */
export const igdbTokens = pgTable(
  "igdb_tokens",
  {
    id: boolean("id").primaryKey().default(true),
    accessToken: text("access_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    obtainedAt: timestamp("obtained_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Pins the table to a single row: the only allowed primary key is true.
  (t) => [check("igdb_tokens_single_row", sql`${t.id}`)],
);

// ---------------------------------------------------------------- works

export const works = pgTable(
  "works",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    igdbId: integer("igdb_id").unique(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),

    workKind: workKind("work_kind").notNull().default("main_game"),
    parentWorkId: uuid("parent_work_id").references((): AnyPgColumn => works.id, {
      onDelete: "cascade",
    }),

    sortTitle: text("sort_title"),
    summary: text("summary"),
    firstReleaseDate: date("first_release_date"),
    coverUrl: text("cover_url"),
    coverSource: artSource("cover_source"),
    coverNeedsReview: boolean("cover_needs_review").notNull().default(false),
    sgdbGameId: integer("sgdb_game_id"),
    igdbPayload: jsonb("igdb_payload"),
    igdbSyncedAt: timestamp("igdb_synced_at", { withTimezone: true }),
    source: sourceKind("source").notNull().default("igdb"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("works_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    index("works_source_idx").on(t.source),
    index("works_parent_idx").on(t.parentWorkId),
    index("works_kind_idx").on(t.workKind),
    check("works_no_self_parent", sql`${t.id} <> ${t.parentWorkId}`),
    check(
      "works_parent_required",
      sql`${t.workKind} <> 'main_game' OR ${t.parentWorkId} IS NULL`,
    ),
  ],
);

// ------------------------------------------------------------- versions

export const versions = pgTable(
  "versions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: versionKind("kind").notNull().default("original"),
    platformId: integer("platform_id").references(() => platforms.id, {
      onDelete: "set null",
    }),

    baseVersionId: uuid("base_version_id").references((): AnyPgColumn => versions.id, {
      onDelete: "set null",
    }),

    releaseDate: date("release_date"),
    versionLabel: text("version_label"),
    author: text("author"),
    url: text("url"),
    coverUrl: text("cover_url"),
    coverSource: artSource("cover_source"),
    coverNeedsReview: boolean("cover_needs_review").notNull().default(false),
    sgdbGameId: integer("sgdb_game_id"),
    notes: text("notes"),

    igdbId: integer("igdb_id"),
    source: sourceKind("source").notNull().default("igdb"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("versions_work_idx").on(t.workId),
    index("versions_base_idx").on(t.baseVersionId),
    index("versions_kind_idx").on(t.kind),
    check("versions_no_self_base", sql`${t.id} <> ${t.baseVersionId}`),
  ],
);

// -------------------------------------------------------------- entries

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),

    status: logStatus("status").notNull().default("backlog"),
    completion: completionLevel("completion"),

    // 1..10 half-star scale, rendered as 0.5..5 stars.
    rating: smallint("rating"),
    review: text("review"),
    reviewHasSpoilers: boolean("review_has_spoilers").notNull().default(false),

    isFavourite: boolean("is_favourite").notNull().default(false),
    isPrivate: boolean("is_private").notNull().default(false),

    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("entries_user_id_version_id_key").on(t.userId, t.versionId),
    index("entries_user_status_idx").on(t.userId, t.status),
    index("entries_version_idx").on(t.versionId),
    check("entries_rating_check", sql`${t.rating} BETWEEN 1 AND 10`),
  ],
);

// ---------------------------------------------------------------- plays

export const plays = pgTable(
  "plays",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    startedOn: date("started_on"),
    finishedOn: date("finished_on"),
    hours: numeric("hours", { precision: 6, scale: 1 }),
    completion: completionLevel("completion"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plays_entry_idx").on(t.entryId),
    check(
      "plays_date_order",
      sql`${t.startedOn} IS NULL OR ${t.finishedOn} IS NULL OR ${t.finishedOn} >= ${t.startedOn}`,
    ),
  ],
);

// -------------------------------------------------------------- shelves

export const shelves = pgTable(
  "shelves",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("shelves_user_id_slug_key").on(t.userId, t.slug)],
);

export const shelfEntries = pgTable(
  "shelf_entries",
  {
    shelfId: uuid("shelf_id")
      .notNull()
      .references(() => shelves.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.shelfId, t.entryId] })],
);

// ----------------------------------------------------------- entry_cards

/**
 * Everything needed to render one shelf tile. Defined in schema.sql and carried
 * in the migration; declared here only so queries against it are typed.
 */
export const entryCards = pgView("entry_cards", {
  entryId: uuid("entry_id"),
  userId: uuid("user_id"),
  status: logStatus("status"),
  rating: smallint("rating"),
  completion: completionLevel("completion"),
  isFavourite: boolean("is_favourite"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  versionId: uuid("version_id"),
  versionName: text("version_name"),
  versionKind: versionKind("version_kind"),
  versionAuthor: text("version_author"),
  coverUrl: text("cover_url"),
  workId: uuid("work_id"),
  workTitle: text("work_title"),
  workSlug: text("work_slug"),
  workKind: workKind("work_kind"),
  parentWorkId: uuid("parent_work_id"),
  parentWorkTitle: text("parent_work_title"),
  platformName: text("platform_name"),
  isCommunityVersion: boolean("is_community_version"),
}).existing();
