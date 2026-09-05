# Project Rules

## Validation Constraints

- Do not perform browser-based verification for this project, including manual browser checks, Playwright, screenshots, or browser automation.

## Local Compile Validation

When compile validation is requested, run the CI-equivalent local checks from the repository root:

1. `pnpm install --frozen-lockfile`
2. `pnpm api:generate`
3. `git diff --exit-code -- backend/docs packages/api-contract/src/types.generated.ts`
4. `pnpm check` — backend quality checks, API contract validation/type checking, frontend linting, and frontend type checking.
5. `pnpm build` — backend binary build and frontend production build.

Do not run `pnpm test` or `go test ./...` unless explicitly requested.
