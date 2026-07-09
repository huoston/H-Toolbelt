# Contributing to H-Toolbelt

Thanks for your interest in improving H-Toolbelt. This document describes the
basic workflow for contributions.

## License

H-Toolbelt is licensed under the **GNU General Public License v3.0 or later**
(`GPL-3.0-or-later`). By contributing, you agree that your contributions are
licensed under the same terms. New custom source files must carry the project
attribution header and the `GPL-3.0-or-later` SPDX identifier.

## Issues

- Search existing issues before opening a new one.
- For bug reports, include your After Effects version, OS, and clear steps to
  reproduce.
- For feature requests, describe the motion-design workflow you want to speed up.

## Pull requests

1. Fork the repository and create a topic branch off `main`.
2. Make focused changes; keep unrelated edits in separate PRs.
3. Ensure the project still builds and packages:
   ```bash
   yarn install
   yarn build
   yarn zxp
   ```
4. Open a pull request describing the change and how you verified it.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Use prefixes such as `feat:`, `fix:`, `chore:`, `ci:`, and `docs:`.

## Language

All code, comments, documentation, filenames, and commit messages are written in
**English**.
