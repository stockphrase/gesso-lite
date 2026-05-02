'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'auto' | 'dark'

const STORAGE_KEY = 'gl.theme'

function applyTheme(theme: Theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('auto')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'auto'
    setTheme(stored)
    applyTheme(stored)
    setMounted(true)
  }, [])

  function choose(next: Theme) {
    setTheme(next)
    applyTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  // Render a placeholder until mounted to avoid a hydration mismatch
  // (server doesn't know the user's choice; client reads it from localStorage).
  if (!mounted) {
    return (
      <div
        className="gl-theme-toggle"
        aria-hidden="true"
        style={{ visibility: 'hidden' }}
      >
        <button>Light</button>
        <button>Auto</button>
        <button>Dark</button>
      </div>
    )
  }

  return (
    <div className="gl-theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        aria-pressed={theme === 'light'}
        onClick={() => choose('light')}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={theme === 'auto'}
        onClick={() => choose('auto')}
      >
        Auto
      </button>
      <button
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => choose('dark')}
      >
        Dark
      </button>
    </div>
  )
}
