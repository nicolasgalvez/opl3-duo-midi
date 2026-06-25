import { useEffect, useRef, useState } from 'react'
import { MENUS } from '../lib/menu'
import { dispatchMenuAction } from '../menuActions'
import { useStore } from '../store'

export default function MenuBar() {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const features = useStore((s) => s.config.features)

  // Hide menus/items disabled by the runtime config (e.g. player-only).
  const menus = MENUS.filter((m) => m.title !== 'Edit' || features.edit).map((m) =>
    m.title === 'View' && !features.library
      ? { ...m, items: m.items.filter((i) => i.id !== 'view.toggleLibrary') }
      : m,
  )

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="menubar" ref={ref} role="menubar">
      {menus.map((menu) => (
        <div className="menu" key={menu.title}>
          <button
            type="button"
            className="menu-title"
            aria-haspopup="true"
            aria-expanded={open === menu.title}
            onClick={() => setOpen(open === menu.title ? null : menu.title)}
          >
            {menu.title}
          </button>
          {open === menu.title && (
            <ul className="menu-items" role="menu">
              {menu.items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      dispatchMenuAction(item.id)
                      setOpen(null)
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
