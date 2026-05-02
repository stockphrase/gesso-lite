import Link from 'next/link'
import ThemeToggle from '@/app/_components/ThemeToggle'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--gl-soft)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <p
              className="gl-label"
              style={{ margin: 0, color: 'var(--gl-ink)' }}
            >
              Gesso Lite
            </p>
          </Link>
        </div>
        <div
          style={{
            background: 'var(--gl-paper)',
            border: '1px solid var(--gl-hairline)',
            padding: '40px 32px',
          }}
        >
          {children}
        </div>
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <ThemeToggle />
        </div>
      </div>
    </main>
  )
}
