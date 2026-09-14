# gameshelf

Self-hosted game tracker with first-class support for romhacks, fan
translations, decomp ports and recomps.

See `CLAUDE.md` for the project brief, `schema.sql` for the data model and
`PROGRESS.md` for the dev log.

## Development

Runs in WSL2 (Ubuntu 24.04) with the repo on the Linux filesystem, not
`/mnt/c/`. Docker Engine is installed inside the distro rather than Docker
Desktop, so dev uses the same daemon as the server.

```bash
cp .env.example .env     # fill in IGDB and SteamGridDB credentials
docker compose up -d db  # Postgres only; the app runs on the host
npm install
npm run db:migrate
npm run dev              # http://localhost:3000
```

| Script | Does |
|---|---|
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema straight to the dev database |
| `npm run db:studio` | Drizzle Studio |

Migrations are the artifact that builds a database. `schema.sql` is the
readable reference for the design, kept in step with the Drizzle schema by
hand.

## Deployment

```bash
docker compose up -d     # app + db
```
