import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getMissingEnvVars } from '@/lib/env-check'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isSetupRoute = pathname.startsWith('/setup')
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')
  const isJoinRoute = pathname.startsWith('/join')
  const isStaticRoute = pathname.startsWith('/_next') || pathname === '/favicon.ico'

  if (!isStaticRoute && !isSetupRoute && !isApiRoute) {
    const missing = getMissingEnvVars()
    if (missing.length > 0) {
      const setupUrl = request.nextUrl.clone()
      setupUrl.pathname = '/setup'
      return NextResponse.redirect(setupUrl)
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !isAuthRoute && !isApiRoute && !isJoinRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
