# Pulling updates from official Stoat

Each of Ferret's three repos has an `upstream` remote pointing at the
official Stoat repo. Update them **bottom-up**: SDK → web client → desktop,
because each one points at a specific commit of the one below it.

Run everything from a terminal in the Ferret folder. Check where you are
first:

```bash
git status
git submodule status --recursive
```

Commit or stash any work in progress before you start.

## 0. One-time setup on a fresh clone

`git clone` only creates `origin`. Add the `upstream` remotes once:

```bash
git remote add upstream https://github.com/stoatchat/for-desktop.git
git -C web remote add upstream https://github.com/stoatchat/for-web.git
git -C web/packages/stoat.js remote add upstream https://github.com/stoatchat/javascript-client-sdk.git
```

Submodules check out a bare commit ("detached HEAD"). Before changing
anything inside one, put it on its `main` branch:

```bash
git -C web checkout main
git -C web/packages/stoat.js checkout main
```

## 1. Web client (`web/`)

```bash
cd web
git fetch upstream
git merge upstream/main
```

If Git reports conflicts, open each listed file and search for
`Ferret mod`. Keep Stoat's new code **and** re-apply the marked Ferret lines.
Then `git add <file>` for each file and run `git commit`.

## 2. SDK (`web/packages/stoat.js`)

The official web client doesn't always use the SDK's `main` branch; it pins
an exact commit. Ferret follows that pin. After step 1, find out which commit
Stoat now uses:

```bash
git -C web ls-tree upstream/main packages/stoat.js
```

The long hash in the output is Stoat's SDK commit. Merge it into Ferret's SDK:

```bash
cd packages/stoat.js
git fetch upstream
git fetch upstream <that-hash>
git merge <that-hash>
# resolve "Ferret mod" conflicts the same way as above
git push origin main
cd ../..
```

Then record the new SDK commit in the web repo and push it (still inside `web/`):

```bash
git add packages/stoat.js
git commit -m "chore: update SDK"
git push origin main
cd ..
```

## 3. Desktop app (repo root)

```bash
git fetch upstream
git merge upstream/main
```

Typical conflicts:

- **Files Ferret deleted** (`assets` submodule): keep them deleted with
  `git rm assets`.
- **Edited files** (`src/main.ts`, `forge.config.ts`, `package.json`, …):
  search for `Ferret mod` and re-apply.
- **`pnpm-lock.yaml`**: accept Stoat's version, then run `pnpm install` to
  regenerate it.

Finally, record the updated web client and push:

```bash
git add web
git commit -m "chore: update web client"
git push origin main
```

## 4. Test, then release

```bash
pnpm install
pnpm web:build
pnpm start
```

If everything works, publish a new version (see the README):

```bash
git tag v1.0.1
git push origin v1.0.1
```

## Tips

- Keep Ferret's own changes inside `src/ferret/`, `src/world/ferret.ts` and
  `web/packages/client/components/ferret/` where possible. Code in those
  files never conflicts with Stoat updates.
- If a merge goes wrong before you commit, `git merge --abort` puts things
  back the way they were.
