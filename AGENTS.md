# Project Rules

## Validation Constraints

- Do not compile, build, bundle, type-check, or run compile-dependent tests locally in this repository.
- Do not run local commands that trigger compilation, including `go build`, `go run`, `go test`, `go vet`, `pnpm build`, `pnpm test`, `pnpm check`, TypeScript type checking, Next.js build or development servers, and Docker image builds.
- When compilation or build validation is required, use the repository's GitHub Actions CI workflows and report the CI result.
- Do not perform browser-based verification for this project, including manual browser checks, Playwright, screenshots, or browser automation.
