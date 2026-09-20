import { CHECKLIST_ICON_NAMES, CHECKLIST_ICONS, DEFAULT_CHECKLIST_ICON } from './icons'

export default function IconPicker({ value, onChange }: { value: string | null; onChange: (icon: string) => void }) {
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
