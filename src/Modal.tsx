import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * A centered dialog over a dimmed backdrop. Escape, the close button and a backdrop click all
 * call onClose; focus moves to the close button on open and returns to the opener on close
 * (`returnFocus` overrides the opener, for browsers that don't focus a button on click).
 */
export default function Modal({
  title,
  onClose,
  className,
  returnFocus,
  children
}: {
  title: string
  onClose: () => void
  className?: string
  returnFocus?: RefObject<HTMLElement>
  children: ReactNode
}) {
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // Read through a ref so a parent re-render with a new callback doesn't re-run the focus effect.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      ;(returnFocus?.current ?? opener)?.focus()
    }
  }, [returnFocus])

  return createPortal(
    // Portaled to <body>: a modal opened from inside a <label> would otherwise have taps on any
    // non-button part of it (backdrop, padding, title) forwarded to the label's first control —
    // the trigger — which reopened the modal right after it closed.
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeButtonRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
