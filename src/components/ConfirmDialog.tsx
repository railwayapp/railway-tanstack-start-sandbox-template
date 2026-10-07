import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return createPortal(
    <div
      className="dlg-overlay"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }}
    >
      <div
        className="dlg"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <h3>{title}</h3>
        {body && <p>{body}</p>}
        <div className="dlg-actions">
          <button autoFocus className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn danger-solid" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
