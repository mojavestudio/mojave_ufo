/** @framerIntrinsicWidth 1200 */
/** @framerIntrinsicHeight 700 */
/** @framerSupportedLayoutWidth any */
/** @framerSupportedLayoutHeight any */
/** @framerDisableUnlink */

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

type Props = { repoUrl?: string }

function deriveSiteBase(repoUrl?: string): string | undefined {
  if (!repoUrl) return
  const t = repoUrl.trim()
  if (!t) return
  try {
    if (t.startsWith("git@github.com:")) {
      const [o, r] = t.replace("git@github.com:", "").replace(/\.git$/i, "").split("/")
      return o && r ? `https://${o}.github.io/${r}/` : undefined
    }
    const u = new URL(t)
    if (u.hostname === "github.com") {
      const [o, r] = u.pathname.replace(/^\/|\/$/g, "").split("/")
      return o && r ? `https://${o}.github.io/${r.replace(/\.git$/i, "")}/` : undefined
    }
    if (u.hostname.endsWith("github.io")) {
      const seg = u.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean)[0]
      return seg ? `${u.origin}/${seg}/` : `${u.origin}/`
    }
  } catch {}
  return
}

export default function SelfHostedSplineIframe({ repoUrl = "https://github.com/mojavestudio/mojave_ufo" }: Props) {
  const site = React.useMemo(() => deriveSiteBase(repoUrl), [repoUrl])
  const src = site ?? undefined

  // Basic wrapper fills the frame; the hosted page handles poster + first-frame logic
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {src ? (
        <iframe
          title="Spline"
          src={src}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          allow="fullscreen"
          loading="lazy"
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "#000" }} />
      )}
    </div>
  )
}

addPropertyControls(SelfHostedSplineIframe, {
  repoUrl: {
    type: ControlType.String,
    title: "GitHub Pages URL",
    defaultValue: "https://mojavestudio.github.io/mojave_ufo/",
    placeholder: "https://<user>.github.io/<repo>/",
  },
})

