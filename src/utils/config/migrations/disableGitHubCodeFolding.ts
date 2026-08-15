type StoredConfig = Record<string, unknown>

// github.com replaced the legacy blob table that Gitako's folding integration
// requires. Existing installations can still carry the old default `true`, so
// migrate that persisted value while leaving every GitHub Enterprise host
// untouched.
export function disableGitHubCodeFolding(config: unknown): StoredConfig | null {
  if (typeof config !== 'object' || config === null || !('codeFolding' in config)) return null
  const storedConfig = config as StoredConfig
  if (storedConfig.codeFolding !== true) return null
  return { ...storedConfig, codeFolding: false }
}
