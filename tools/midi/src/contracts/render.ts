/**
 * The stored-render-job / parsed-argv shape: camelCased render flag names to
 * their values. Produced by extractRenderArgs() (src/cli/renderOptions.ts) and
 * persisted verbatim in queued jobs, so it stays a loose bag by design.
 */
export type RenderArgs = Record<string, unknown>
