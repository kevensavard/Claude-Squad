const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_PARTYKIT_HOST',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
] as const

export function getMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((key) => !process.env[key])
}

export function hasAllEnvVars(): boolean {
  return getMissingEnvVars().length === 0
}
