CREATE TABLE "igdb_tokens" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"access_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"obtained_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "igdb_tokens_single_row" CHECK ("igdb_tokens"."id")
);
