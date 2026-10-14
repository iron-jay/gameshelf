# Shelf (phone app)

One app for both shelves: bookshelf in sage, gameshelf in amber, switched by
tapping the other app's name in the header. Expo and React Native; it talks to
each server's JSON API (`/api/v1`, see each app's README) and keeps nothing of
its own beyond the two addresses and, where a server asks for sign-in, a device
token in the phone's keychain.

## What it does

- **Shelves**: the Reading now / Now playing band with Finished it and Did not
  finish / Drop, then a strip per shelf on a plank, with See all.
- **All**: the wall, three covers to a plank. Shelf, sort, tag and platform go
  to the server; the title box filters on every keystroke.
- **Search**: books (this server, Open Library and Hardcover), comics (Comic
  Vine), games (this server and IGDB). An ISBN, typed or **scanned with the
  camera**, goes straight to its edition.
- **Add**: Book or Audiobook (remembers the last one), the edition from Open
  Library's list or "any edition", the platform for a game, and the shelf.
- **A book or game**: shelf, completion for a played game, rating as ten bars,
  reads with their dates (books), review, tags, favourite, private, remove.
- **More**: the two server addresses, sign-in where a server needs it, and
  links to the web for import, export, cover art and the account.

Everything else (editing details, changing covers, series and collection pages,
creating a book by hand) stays on the web for now.

## Running it on your phone

The quickest way is Expo Go, from the App Store or Play Store.

```bash
cd mobile
npm install
npx expo start --tunnel   # prints a QR code
```

Scan the QR code with the camera (iPhone) or Expo Go (Android). `--tunnel`
is there because WSL2 sits behind its own network, so the phone can't reach
Metro on the WSL address; with WSL's mirrored networking, or running from
Windows, plain `npx expo start` on the same Wi-Fi works too.

On first launch it asks where your shelves are: the address you open each app
at in a browser at home, like `192.168.1.20:3001` or `https://books.home.lan`.
The phone talks to the servers directly, so it needs to be on the home network
(or VPN) whatever Metro is doing.

## An installable build

Expo Go is fine for daily use but needs the dev server running. For an app of
its own, EAS builds it in the cloud (a free Expo account):

```bash
npx eas-cli@latest build -p android --profile preview   # an .apk to install
npx eas-cli@latest build -p ios                         # needs an Apple developer account
```

`app.json` already allows plain `http://` to the home network (Android
cleartext and iOS local networking), and asks for the camera only to scan a
barcode.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Notes

- Fonts: `assets/fonts` holds static cuts of Archivo made from the same
  variable font the web uses (125% wide at 800 for names, 87.5% for metadata),
  because React Native cannot reach a variable font's width axis. Newsreader
  and Plex Mono come from `@expo-google-fonts`. All are SIL OFL.
- "N finished this year" on the books shelf counts books whose latest finish
  is this year; the web counts reads, so a book finished twice this year
  counts once here.
- A browser preview (`npx expo start --web`) works for layout, but the servers
  send no CORS headers, so it needs a proxy in front of them to load data. The
  phone needs none.
