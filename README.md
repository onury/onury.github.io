# onury.github.io

Source for [onury.io](https://onury.io) — open source projects, experiments and utilities.
Built with [Jekyll](https://jekyllrb.com) and served by GitHub Pages.

## Maintenance

### 2026-06 — cleanup & dependency patch

- Removed a stray pointer file and stale local build output that had been committed by accident.
- Bumped `github-pages` (156 → 223), updating the transitive gem tree (nokogiri, kramdown,
  activesupport, addressable, jekyll, tzinfo, ffi) to patched versions and clearing the
  outstanding security advisories.
- Remaining advisories are pinned by the `github-pages` meta-gem and require malicious input
  to exploit; they don't affect the published static site and were reviewed as tolerable.

The live site is built server-side by GitHub Pages, so the committed `Gemfile.lock` only
affects local builds (`bundle exec jekyll serve`).
