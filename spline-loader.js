// Idempotent loader for the Spline viewer web component.
// - Avoids duplicate custom element registration
// - Reuses an existing global THREE if present by not importing another copy
//   (the viewer bundles its own THREE; this ensures we don’t add any extra).

(() => {
  const g = typeof window !== "undefined" ? window : (globalThis as any)
  if (!g) return

  if (!g.__SPLINE__) g.__SPLINE__ = {}
  const state = g.__SPLINE__

  export async function loadSplineViewer(version = "1.10.73") {
    if (typeof window === "undefined") return

    // If already defined, we’re done.
    if (customElements.get("spline-viewer")) return

    // If a load is already in-flight, await it.
    if (state.loading) return state.loading

    state.loading = (async () => {
      // If another runtime put THREE on window, leave it as-is so we don't add more.
      // Spline’s viewer will use its own bundled THREE; we just avoid adding extra copies here.
      try {
        const src = `https://unpkg.com/@splinetool/viewer@${version}/build/spline-viewer.js`
        await import(src)
        await customElements.whenDefined("spline-viewer")
      } catch (e) {
        console.error("Failed to load Spline viewer", e)
        throw e
      } finally {
        // Clear loading state after attempt
        delete state.loading
      }
    })()

    return state.loading
  }
})()

