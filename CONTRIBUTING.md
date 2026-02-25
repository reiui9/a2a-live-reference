# Contributing to A2A-Live Reference

Thanks for contributing 👋

## Development flow

1. Create a branch from `main`
   - `feature/<topic>`
   - `fix/<topic>`
2. Make changes + tests
3. Run checks locally
   ```bash
   npm test
   npm run check
   ```
4. Open PR with summary + test results

## Commit style

Use clear, imperative messages:
- `Add ...`
- `Fix ...`
- `Refactor ...`
- `Docs: ...`

## PR checklist

- [ ] Scope is small and focused
- [ ] Tests added/updated
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] README/spec updated if behavior changed

## Coding rules

- Keep protocol changes backward-aware
- Add/adjust tests for every behavior change
- Prefer explicit error codes over generic errors

## Security

- Never commit secrets/tokens
- Use environment variables for runtime secrets
- If a key leaks, rotate immediately
