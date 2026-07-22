# Merge Conflict Radar

A GitHub Action that checks every open pull request for file overlaps and
warns you *before* two PRs collide — instead of after someone hits a merge
conflict on `main`.

When a PR opens or updates, it compares that PR's changed files against every
other open PR in the repo. If they share files, it posts (and keeps updated)
a comment naming exactly which PRs and which files, so you can coordinate
merge order or plan a rebase ahead of time.

## Usage

Add this to `.github/workflows/merge-conflict-radar.yml` in the repo you
want to watch:

```yaml
name: Merge Conflict Radar

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write

jobs:
  radar:
    runs-on: ubuntu-latest
    steps:
      - uses: johnnyhett/merge-conflict-radar@v1
        with:
          ignore-paths: '*.lock,package-lock.json,dist/**'
          min-shared-files: '1'
```

## Inputs

| Input               | Required | Default            | Description                                                            |
|----------------------|----------|---------------------|--------------------------------------------------------------------------|
| `github-token`       | No       | `${{ github.token }}` | Token used to read PRs and post comments.                             |
| `ignore-paths`       | No       | `''`                 | Comma-separated glob patterns to exclude (lockfiles, build output, etc). |
| `min-shared-files`   | No       | `1`                   | Minimum number of shared files before a warning is posted.              |

## Output

| Output       | Description                                              |
|--------------|-----------------------------------------------------------|
| `collisions` | JSON array of `{ number, title, files }` for each PR that overlaps with the current one. |

## How it works

1. Fetches the changed files for the triggering PR.
2. Lists every other open PR and its changed files.
3. Filters out anything matching `ignore-paths`, then intersects file sets.
4. If the overlap meets `min-shared-files`, upserts a single tagged comment
   (found via a hidden marker) so re-runs update the same comment instead of
   spamming new ones — and clears the warning automatically once the overlap
   is gone.

## Development

```bash
npm install
npm run test:syntax   # quick syntax check
npm run build          # bundles src/index.js -> dist/index.js via ncc
```

`dist/index.js` is committed on purpose — GitHub Actions runs the compiled
file directly, without an install step, so the bundle has to be checked in.
The included `.github/workflows/self-test.yml` runs the action against its
own repo's PRs, which is a simple way to keep it exercised in a real
workflow run.

## License

MIT
