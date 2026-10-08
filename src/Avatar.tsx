import type { Person } from './api'
import { checklistIcon } from './icons'

/** What to call someone: the name they chose, else their email. */
export function personName(person: Pick<Person, 'email' | 'name'>): string {
  return person.name ?? person.email
}

/** The owner of a shared list, by name when they set one. */
export function ownerLabel(list: { ownerEmail: string; ownerName: string | null }): string {
  return list.ownerName ?? list.ownerEmail
}

function initials(person: Person): string {
  const words = (person.name ?? '').split(' ').filter(Boolean)
  if (words.length >= 2) return `${[...words[0]][0]}${[...words[1]][0]}`.toUpperCase()
  return [...personName(person)].slice(0, 2).join('').toUpperCase()
}

/** Their chosen icon, or their initials until they pick one. */
export default function Avatar({ person, className = '' }: { person: Person; className?: string }) {
  const Icon = person.avatar ? checklistIcon(person.avatar) : null
  return (
    <span className={`user-avatar ${className}`.trim()} aria-hidden="true">
      {Icon ? <Icon /> : initials(person)}
    </span>
  )
}
