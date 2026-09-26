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
npm run db:seed          # first user from .env, if there is nobody yet
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
| `npm run db:seed` | Create the first user from `.env`; does nothing once anyone exists |
| `npm run db:studio` | Drizzle Studio |
| `npm run probe:sgdb` | Check SteamGridDB matching against the live API |
| `npm run probe:grouvee -- <file>` | Report what a Grouvee export would import, without writing |

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

Target is a Debian VM on Proxmox rather than an LXC — `CLAUDE.md` section 7 says
why. The steps below were rehearsed end to end against a clean database before
being written down.

### Layout

The compose file expects runtime data as a sibling of the repository, so the two
can be backed up together without the database living inside the build context:

```
/srv/
├── gameshelf/          this repository
└── gameshelf-data/
    ├── pgdata/         Postgres
    └── covers/         downloaded cover art
```

### First run

```bash
git clone <repo> /srv/gameshelf
cd /srv/gameshelf
sudo ./scripts/install-debian.sh
```

That installs Docker — from Debian's own `docker.io` and `docker-compose-v2`
packages where they exist, which avoids adding a third-party repository at all,
falling back to Docker's repository otherwise — creates the data directories,
sets the ownership the container needs, and copies `.env.example` into place.
It is idempotent, so running it again is harmless.

Then fill in `.env`, log out and back in so the `docker` group applies, and:

```bash
docker compose pull
docker compose up -d
```

The manual equivalent, if you would rather not run a script:

```bash
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"
mkdir -p ../gameshelf-data/pgdata ../gameshelf-data/covers
# The app runs as uid 1001 and a bind mount keeps the host's ownership, so
# without this the first cover download fails with EACCES.
sudo chown -R 1001:1001 ../gameshelf-data/covers
cp .env.example .env
```

That starts three things in order: Postgres, a one-shot `migrate` container, then
the app. The app will not start unless migrate exits successfully.

`migrate` exists because `drizzle-kit` and `tsx` are dev dependencies and the
runtime image contains only what Next traced from the app's own imports. It
applies pending migrations and creates the `ADMIN_USERNAME` user if there is not
one. Both are idempotent, so it runs on every deploy and does nothing when there
is nothing to do.

### Images

Every push to `main` builds one image in GitHub Actions and publishes it:

```
ghcr.io/iron-jay/gameshelf
```

The server pulls it rather than building. `next build` does not fit comfortably
in 2 GB, and there is no reason to spend the VM's memory on work a runner has
already done.

The container applies migrations itself before serving anything — a bundled
`migrate.mjs` runs, then `server.js`. Both halves are idempotent, so it happens
on every start and does nothing when there is nothing to do. If the schema
cannot be brought up to date the server does not come up, which is the right way
round.

It has to be bundled rather than imported at runtime: Next's standalone output
contains only what the app itself imports, and `drizzle-orm/postgres-js/migrator`
is not among them. esbuild inlines it, leaving `@node-rs/argon2` external
because it is a native module and is already in the output.

The packages are public even though the repository is not, so the server pulls
without credentials. Nothing secret is in them — no `.env`, no keys — and an
image is inert without the configuration you supply, so the only thing published
is the compiled app and the schema.

If you make them private again, every machine that pulls needs a **classic**
personal access token with `read:packages` (fine-grained tokens are not reliably
accepted by ghcr), and `docker login ghcr.io -u iron-jay` once per user — Docker
stores credentials per-user, so signing in as root does not help a deploy that
runs as someone else.

To pin a specific build rather than the newest, set `GAMESHELF_TAG` in `.env` to
a commit sha. To build the images by hand — if Actions is down, or to try
something before pushing it:

```bash
docker build --target runner -t ghcr.io/iron-jay/gameshelf:latest .
```

### The account

The first start creates one user from `ADMIN_USERNAME` (default `admin`) and
`ADMIN_PASSWORD`. That only ever applies to an empty database — once an account
exists those variables are ignored, and the name is changed in **Settings**
rather than by editing `.env`.

Renaming is safe with sign-in turned off too: that path looks for
`ADMIN_USERNAME` and falls back to the oldest account when it no longer matches
anybody, so a rename cannot lock you out of your own server.

There is no way to change the password from the interface yet.

### Skipping sign-in

On a single-user server that nothing outside your network can reach, set:

```
AUTH_DISABLED=true
```

Every page then loads without signing in, from any device that can reach the
port. The admin user still has to exist — you just walk past the login form,
which redirects to the shelf.

It is a whole-app switch, not a per-route one, because half-authenticated is a
worse place to be than either end. So it removes the password from editing and
deleting as well as from reading, and from the cover and export routes. That is
the right trade behind a firewall and the wrong one anywhere a port forward, a
tunnel or a VPN guest could reach. The header says `sign-in off` while it is on,
and Settings spells out what it means.

### Reverse proxy

The app listens on plain HTTP on `127.0.0.1:3000`; TLS terminates at the proxy.
Two things matter:

- **Forward the original `Host`.** Next checks a server action's `Origin`
  against the host it believes it is serving, and this app is server actions
  from top to bottom — login included. nginx's `proxy_set_header Host $host` and
  Caddy's default both do the right thing. A request carrying the public name in
  both `Host` and `Origin` is accepted; one with a foreign `Origin` is rejected.
- **`ORIGIN` must be the public `https://` URL.** The session cookie's `Secure`
  flag is derived from it, so an `http://` value ships insecure cookies.

Caddy needs nothing beyond:

```
gameshelf.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

### Updating

```bash
docker compose pull
docker compose up -d
```

Migrations run before the new app starts. Add `git pull` first when
`docker-compose.yml` or `.env.example` have changed — the compose file lives in
the repository, the images do not.

### Backups

Both bind mounts sit under `../gameshelf-data`, so a Proxmox VM backup covers
them. For a logical dump as well:

```cron
0 3 * * * cd /srv/gameshelf && docker compose exec -T db pg_dump -U gameshelf gameshelf | gzip > ../gameshelf-data/dump-$(date +\%F).sql.gz
```

### Ports

Both services bind to `127.0.0.1` so nothing is exposed to the LAN by default.
Override with `APP_BIND`, `APP_PORT`, `DB_BIND` and `DB_PORT` — for instance if
the reverse proxy runs on another host.

### Sizing

`CLAUDE.md` suggests 2 vCPU / 2 GB, which is comfortable now that the server only
ever pulls. 32 GB of disk leaves room for the images, Postgres and a cover
library — the art runs a few hundred KB per game.

**Check the guest actually has that disk**, because a Debian cloud image does not
grow into it on its own:

```bash
df -h /        # should be most of the disk, not 2.9G
```

A hypervisor reporting 32 GB says nothing about the filesystem inside. Left at
the image's default, root fills in an afternoon — every `docker compose pull`
leaves the previous image behind — and Postgres goes down with it, which
presents as the whole app 500ing for no visible reason. Growing it is
`growpart /dev/sda 1 && resize2fs /dev/sda1`, online, no reboot.
