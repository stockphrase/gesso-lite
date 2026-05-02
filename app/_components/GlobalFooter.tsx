import ThemeToggle from './ThemeToggle'

export default function GlobalFooter({
  signedInAs,
}: {
  signedInAs?: string | null
}) {
  return (
    <div className="gl-footer">
      {signedInAs ? (
        <span>Signed in as {signedInAs}</span>
      ) : (
        <span style={{ color: 'var(--gl-mute)' }}>Not signed in</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <ThemeToggle />
        {signedInAs && (
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--gl-mute)',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 13,
                padding: 0,
                borderBottom: '1px solid var(--gl-hairline)',
              }}
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
