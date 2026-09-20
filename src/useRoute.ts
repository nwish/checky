import { useCallback, useEffect, useState } from 'react'

// Minimal client-side router: two real routes (/ and /admin) don't warrant a
// routing library. Tracks pathname and exposes a pushState-based navigate.
export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState(null, '', to)
      setPath(to)
    }
  }, [])

  return { path, navigate }
}
