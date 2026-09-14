import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

export default function ContextMenu(props: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: props.x, top: props.y })

  useLayoutEffect(() => {
    const node = menuRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8))
    })
  }, [props.x, props.y])

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) props.onClose() }
    const closeNow = () => props.onClose()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onClose() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', closeNow)
    window.addEventListener('resize', closeNow)
    window.addEventListener('wheel', closeNow, { passive: true })
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', closeNow)
      window.removeEventListener('resize', closeNow)
      window.removeEventListener('wheel', closeNow)
      window.removeEventListener('keydown', escape)
    }
  }, [props.onClose])

  return createPortal(<div ref={menuRef} className="context-menu" role="menu" style={position} onContextMenu={(event) => event.preventDefault()}>
    {props.items.map((item, index) => <Fragment key={`${item.label}-${index}`}>{item.separator && <div className="context-menu-separator" />}<button className={item.danger ? 'danger' : ''} disabled={item.disabled} onClick={() => { if (item.disabled) return; item.onClick?.(); props.onClose() }}>{item.label}</button></Fragment>)}
  </div>, document.body)
}
