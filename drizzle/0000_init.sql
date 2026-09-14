CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--> statement-breakpoint
CREATE TYPE "public"."art_source" AS ENUM('igdb', 'steamgriddb', 'upload');--> statement-breakpoint
CREATE TYPE "public"."completion_level" AS ENUM('unfinished', 'credits', 'completed', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."log_status" AS ENUM('backlog', 'playing', 'played', 'dropped', 'shelved', 'wishlist');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('igdb', 'local');--> statement-breakpoint
CREATE TYPE "public"."version_kind" AS ENUM('original', 'port', 'remaster', 'remake', 'compilation', 'romhack', 'translation', 'decomp_port', 'recomp', 'mod', 'homebrew', 'other');--> statement-breakpoint
CREATE TYPE "public"."work_kind" AS ENUM('main_game', 'dlc', 'expansion', 'standalone_expansion', 'episode', 'season', 'bundle');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"status" "log_status" DEFAULT 'backlog' NOT NULL,
	"completion" "completion_level",
	"rating" smallint,
	"review" text,
	"review_has_spoilers" boolean DEFAULT false NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_user_id_version_id_key" UNIQUE("user_id","version_id"),
	CONSTRAINT "entries_rating_check" CHECK ("entries"."rating" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" serial PRIMARY KEY NOT NULL,
	"igdb_id" integer,
	"name" text NOT NULL,
	"abbreviation" text,
	"source" "source_kind" DEFAULT 'igdb' NOT NULL,
	CONSTRAINT "platforms_igdb_id_unique" UNIQUE("igdb_id")
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"entry_id" uuid NOT NULL,
	"started_on" date,
	"finished_on" date,
	"hours" numeric(6, 1),
	"completion" "completion_level",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plays_date_order" CHECK ("plays"."started_on" IS NULL OR "plays"."finished_on" IS NULL OR "plays"."finished_on" >= "plays"."started_on")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_entries" (
	"shelf_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelf_entries_shelf_id_entry_id_pk" PRIMARY KEY("shelf_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "shelves" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelves_user_id_slug_key" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"work_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "version_kind" DEFAULT 'original' NOT NULL,
	"platform_id" integer,
	"base_version_id" uuid,
	"release_date" date,
	"version_label" text,
	"author" text,
	"url" text,
	"cover_url" text,
	"cover_source" "art_source",
	"cover_needs_review" boolean DEFAULT false NOT NULL,
	"sgdb_game_id" integer,
	"notes" text,
	"igdb_id" integer,
	"source" "source_kind" DEFAULT 'igdb' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "versions_no_self_base" CHECK ("versions"."id" <> "versions"."base_version_id")
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"igdb_id" integer,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"work_kind" "work_kind" DEFAULT 'main_game' NOT NULL,
	"parent_work_id" uuid,
	"sort_title" text,
	"summary" text,
	"first_release_date" date,
	"cover_url" text,
	"cover_source" "art_source",
	"cover_needs_review" boolean DEFAULT false NOT NULL,
	"sgdb_game_id" integer,
	"igdb_payload" jsonb,
	"igdb_synced_at" timestamp with time zone,
	"source" "source_kind" DEFAULT 'igdb' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_igdb_id_unique" UNIQUE("igdb_id"),
	CONSTRAINT "works_slug_unique" UNIQUE("slug"),
	CONSTRAINT "works_no_self_parent" CHECK ("works"."id" <> "works"."parent_work_id"),
	CONSTRAINT "works_parent_required" CHECK ("works"."work_kind" <> 'main_game' OR "works"."parent_work_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_base_version_id_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_parent_work_id_works_id_fk" FOREIGN KEY ("parent_work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_user_status_idx" ON "entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "entries_version_idx" ON "entries" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "plays_entry_idx" ON "plays" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "versions_work_idx" ON "versions" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "versions_base_idx" ON "versions" USING btree ("base_version_id");--> statement-breakpoint
CREATE INDEX "versions_kind_idx" ON "versions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "works_title_trgm_idx" ON "works" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "works_source_idx" ON "works" USING btree ("source");--> statement-breakpoint
CREATE INDEX "works_parent_idx" ON "works" USING btree ("parent_work_id");--> statement-breakpoint
CREATE INDEX "works_kind_idx" ON "works" USING btree ("work_kind");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER works_touch   BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER entries_touch BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE VIEW entry_cards AS
SELECT
  e.id                AS entry_id,
  e.user_id,
  e.status,
  e.rating,
  e.completion,
  e.is_favourite,
  e.updated_at,
  v.id                AS version_id,
  v.name              AS version_name,
  v.kind              AS version_kind,
  v.author            AS version_author,
  -- A community version never inherits the parent work's boxart: showing
  -- Ocarina of Time's cover for a romhack looks correct and is wrong, which
  -- is a worse outcome than no art at all. Own art or placeholder, nothing else.
  CASE
    WHEN v.kind NOT IN ('original','port','remaster','remake','compilation')
      THEN v.cover_url
    ELSE COALESCE(v.cover_url, w.cover_url)
  END                 AS cover_url,
  w.id                AS work_id,
  w.title             AS work_title,
  w.slug              AS work_slug,
  w.work_kind,
  w.parent_work_id,
  pw.title            AS parent_work_title,
  p.name              AS platform_name,
  (v.kind NOT IN ('original','port','remaster','remake','compilation')) AS is_community_version
FROM entries e
JOIN versions v  ON v.id = e.version_id
JOIN works w     ON w.id = v.work_id
LEFT JOIN works pw    ON pw.id = w.parent_work_id
LEFT JOIN platforms p ON p.id = v.platform_id;
