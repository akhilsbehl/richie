# Richie project instructions

Richie is a TypeScript application for reviewing Markdown documents.

## Development

- Use Node.js 22 or newer.
- Run `npm run check` for type checks.
- Run `npm test` for the build and test suite.
- Run `npm run build` to produce the client and server build.

## Submodule development

This project is checked out as a Git submodule of `configs`. For normal development, switch from the parent's detached pinned commit to a named child branch before editing. Commit and push changes in this child repository, then update the parent repository's submodule pin in a separate commit. Use the detached pinned state only for read-only verification, reproduction, or testing the exact parent integration.
