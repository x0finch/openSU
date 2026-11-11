// Minimal typing of the Workers runtime module (run `pnpm cf-typegen` for
// the full generated types once bindings exist).
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
