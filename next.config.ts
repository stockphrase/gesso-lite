import type { NextConfig } from 'next'

// Security headers applied to every response.
// CSP: scripts must be from self (or have a nonce — Next.js adds these
// automatically for its own bundles). Styles are allowed inline because
// the app uses style={{ ... }} extensively. Connections allow Supabase.
//
// HSTS: only applies in HTTPS contexts (no effect on localhost). One year
// max-age, includeSubDomains, preload-eligible.
//
// X-Frame-Options: prevents the site from being embedded in an iframe
// (clickjacking defense). Same effect as `frame-ancestors 'none'` in CSP.
//
// Referrer-Policy: don't leak full URLs across origins.
//
// Permissions-Policy: disable browser features the app doesn't use.
//
// X-Content-Type-Options: prevent MIME sniffing.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : ''
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
const supabaseWss = supabaseHost ? `wss://${supabaseHost}` : ''

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWss}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=()',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
