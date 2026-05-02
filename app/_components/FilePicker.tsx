'use client'

import { useRef, useState } from 'react'

export default function FilePicker({
  accept,
  onChange,
  disabled,
  selected,
}: {
  accept?: string
  onChange: (file: File | null) => void
  disabled?: boolean
  /** Optional controlled filename to display. If omitted, internal state is used. */
  selected?: File | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [internal, setInternal] = useState<File | null>(null)
  const file = selected !== undefined ? selected : internal

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (selected === undefined) setInternal(f)
    onChange(f)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flex: 1,
        minWidth: 0,
      }}
    >
      <button
        type="button"
        className="gl-btn-ghost"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        style={{
          flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Choose file
      </button>
      <span
        style={{
          fontSize: 13,
          color: file ? 'var(--gl-ink)' : 'var(--gl-mute)',
          fontFamily: file
            ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
            : 'inherit',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {file ? file.name : 'No file selected'}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}
