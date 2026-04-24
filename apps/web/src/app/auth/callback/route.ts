import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') ? rawNext : '/'

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url))
  }

  try {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  } catch {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_code', request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}
