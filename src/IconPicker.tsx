import { useEffect, useRef, useState } from 'react'
import { CHECKLIST_ICON_NAMES, CHECKLIST_ICONS, checklistIcon, DEFAULT_CHECKLIST_ICON } from './icons'

/** The grid of icon choices. */
function IconGrid({ value, onChange }: { value: string | null; onChange: (icon: string) => void }) {
  return (
    <div className="icon-picker" role="radiogroup" aria-label="Icon">
      {CHECKLIST_ICON_NAMES.map((name) => {
        const Icon = CHECKLIST_ICONS[name]
        const active = value ? value === name : name === DEFAULT_CHECKLIST_ICON
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={name}
            title={name}
            className={`icon-swatch${active ? ' active' : ''}`}
            onClick={() => onChange(name)}
          >
            <Icon />
          </button>
        )
      })}
    </div>
  )
}

/** A compact trigger showing the current icon; click opens the full grid in a modal. */
export default function IconPicker({ value, onChange }: { value: string | null; onChange: (icon: string) => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const Icon = checklistIcon(value)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      triggerRef.current?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="icon-picker-trigger"
        onClick={() => setOpen(true)}
        aria-label="Choose icon"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon />
      </button>
      {open && (
        <div className="icon-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="icon-modal" role="dialog" aria-modal="true" aria-labelledby="icon-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="icon-modal-header">
              <h2 id="icon-modal-title">Choose an icon</h2>
              <button ref={closeButtonRef} type="button" className="icon-modal-close" onClick={() => setOpen(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            <IconGrid
              value={value}
              onChange={(icon) => {
                onChange(icon)
                setOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
