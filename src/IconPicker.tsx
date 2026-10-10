import { useRef, useState } from 'react'
import { CHECKLIST_ICON_NAMES, CHECKLIST_ICONS, checklistIcon, DEFAULT_CHECKLIST_ICON } from './icons'
import Modal from './Modal'

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
  const Icon = checklistIcon(value)

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
        <Modal title="Choose an icon" onClose={() => setOpen(false)} returnFocus={triggerRef}>
          <IconGrid
            value={value}
            onChange={(icon) => {
              onChange(icon)
              setOpen(false)
            }}
          />
        </Modal>
      )}
    </>
  )
}
