// Idempotent Three.js loader that only imports Three
// if there is no global `window.THREE` yet.
// It does NOTHING automatically — call `ensureThree()` from your code
// only when you actually need Three.

export async function ensureThree(version = "0.159.0") {
  if (typeof window === "undefined") return undefined

  // Reuse existing global instance if present
  if (window.THREE) return window.THREE

  // Deduplicate concurrent loads (Strict Mode, multiple callers)
  if (window.__THREE_READY__) return window.__THREE_READY__

  window.__THREE_READY__ = (async () => {
    // 1) Try project-resolved ESM first (no extra copy if already bundled)
    try {
      const mod = await import("three")
      const THREE = mod.default ?? mod
      window.THREE = THREE
      return THREE
    } catch (_) {}

    // 2) CDN ESM
    try {
      const mod = await import(`https://unpkg.com/three@${version}/build/three.module.js`)
      const THREE = mod.default ?? mod
      window.THREE = THREE
      return THREE
    } catch (_) {}

    // 3) Fallback to UMD global
    await new Promise((resolve, reject) => {
      const s = document.createElement("script")
      s.async = true
      s.crossOrigin = "anonymous"
      s.src = `https://unpkg.com/three@${version}/build/three.min.js`
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })

    if (!window.THREE) throw new Error("THREE failed to load from all sources")
    return window.THREE
  })()

  return window.__THREE_READY__
}

// Safe helper that never throws; returns undefined on failure.
export async function getThree(version = "0.159.0") {
  try {
    return await ensureThree(version)
  } catch {
    return undefined
  }
}

declare global {
  interface Window {
    THREE?: any
    __THREE_READY__?: Promise<any>
  }
}

