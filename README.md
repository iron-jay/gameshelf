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
npm run db:seed          # creates ADMIN_USERNAME from .env
npm run dev              # http://localhost:3000
```

To reach the dev server from a browser on the Windows side, bind it to all
interfaces: `npx next dev -H 0.0.0.0`.

### Runtime data lives outside the repository

Postgres and the downloaded cover art are bind-mounted from `../gameshelf-data/`
rather than from a directory inside the project:

```
code/
├── gameshelf/          the repository
└── gameshelf-data/
    ├── pgdata/         Postgres
    └── covers/         downloaded cover art
```

This is not cosmetic. The bundler traces filesystem access in server code, and
an `fs` path it cannot resolve statically makes it walk the whole project
directory into the server bundle — which fails outright on the root-owned
Postgres files. For the same reason **`COVERS_DIR` must be an absolute path**:
resolving a relative one means naming `process.cwd()`, which is exactly the
anchor the bundler catches on.

| Script | Does |
|---|---|
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema straight to the dev database |
| `npm run db:seed` | Create the single user from `.env` |
| `npm run db:studio` | Drizzle Studio |
| `npm run probe:sgdb` | Check SteamGridDB matching against the live API |

Migrations are the artifact that builds a database. `schema.sql` is the readable
reference for the design, kept in step with the Drizzle schema by hand. After
generating a migration that creates schema objects, run
`python3 scripts/augment-migration.py drizzle/<file>.sql` to add the extensions,
trigger and view that drizzle-kit cannot express.

### Export

Both formats are plain authenticated GETs, so they work from a browser or a
shell:

```bash
curl -b "gameshelf_session=$TOKEN" -OJ http://localhost:3000/export/json
```

JSON keeps every play; CSV is one row per shelf entry with plays summarised.
Cached IGDB payloads are excluded on purpose — they are upstream data that can
be fetched again, not yours.

## Deployment

```bash
docker compose up -d     # app + db
```
