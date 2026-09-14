import { useEffect, useRef, useState } from 'react'
import { errorMessage } from './helpers'

interface TextInputDialogProps {
  title: string
  label: string
  initialValue?: string
  confirmLabel?: string
  validate?: (value: string) => string | null
  onConfirm: (value: string) => Promise<void>
  onClose: () => void
}

export default function TextInputDialog(props: TextInputDialogProps) {
  const [value, setValue] = useState(props.initialValue ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (props.initialValue) inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [props.initialValue])

  const submit = async () => {
    const normalized = value.trim()
    const validationError = !normalized ? '名称不能为空' : props.validate?.(normalized) ?? null
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await props.onConfirm(normalized)
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) props.onClose() }}>
      <div className="modal compact-modal">
        <header><h2>{props.title}</h2><button aria-label="关闭" disabled={busy} onClick={props.onClose}>×</button></header>
        <div className="modal-body">
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <label>{props.label}<input ref={inputRef} autoFocus value={value} onChange={(event) => { setValue(event.target.value); setError(null) }} /></label>
            {error && <p className="dialog-error" role="alert">{error}</p>}
            <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={props.onClose}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy ? '处理中…' : props.confirmLabel ?? '确认'}</button></div>
          </form>
        </div>
      </div>
    </div>
  )
}