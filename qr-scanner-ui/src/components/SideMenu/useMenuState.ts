import { useState } from 'react'

export function useMenuState() {
  const [open, setOpen] = useState(false)

  const toggle = () => setOpen((prev) => !prev)
  const close = () => setOpen(false)

  return { open, toggle, close }
}

export default useMenuState
