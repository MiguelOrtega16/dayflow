export const env = {
  isDev:        process.env.NEXT_PUBLIC_ENV === 'development',
  isStaging:    process.env.NEXT_PUBLIC_ENV === 'staging',
  isProd:       process.env.NEXT_PUBLIC_ENV === 'production',
  label:        (process.env.NEXT_PUBLIC_ENV ?? 'development') as 'development' | 'staging' | 'production',
  appUrl:       process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  supabaseUrl:  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
}
