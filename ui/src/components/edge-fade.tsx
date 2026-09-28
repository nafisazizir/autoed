import { cn } from "@/lib/utils"

// How deep the edge reaches. The strip takes this height and the negative
// margin below gives it straight back, so the two have to stay in step.
// Tailwind only sees class names written out in full, so they are literals.
const DEPTH = "h-12"
const PULL_BACK = { top: "-mb-12", bottom: "-mt-12" }

// The viewport edge, as frosted glass rather than a hard cut. A gradient
// dissolves the page into the background, and under it a stack of masked
// backdrop blurs ramps the blur up toward the edge: a single blurred layer
// would switch on at a line, so each layer here blurs twice as much as the
// one below it over roughly half the distance. Blur compounds where the
// layers overlap, which is what makes the last few pixels go soft.
const LAYERS = [
  { blur: 0.5, reach: 100 },
  { blur: 1, reach: 62 },
  { blur: 2, reach: 38 },
  { blur: 4, reach: 20 },
]

// Sticky rather than fixed so the strip belongs to the page's own column.
// It spans the full width, above both rails, so the sidebar and the table of
// contents fade with everything else. The strip hangs under --header-height
// and dissolves into --edge-fade, the page background unless the frame it
// sits in paints its own (business-x paints background-100).
export function EdgeFade({ side }: { side: "top" | "bottom" }) {
  const away = side === "top" ? "bottom" : "top"

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none sticky z-30",
        DEPTH,
        PULL_BACK[side],
        side === "top" ? "top-(--header-height)" : "bottom-0"
      )}
    >
      {LAYERS.map(({ blur, reach }) => {
        const mask = `linear-gradient(to ${away}, #000 0%, transparent ${reach}%)`

        return (
          <div
            key={blur}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        )
      })}
      <div
        className={cn(
          "absolute inset-0 from-(--edge-fade,var(--color-background-100)) to-transparent",
          side === "top" ? "bg-linear-to-b" : "bg-linear-to-t"
        )}
      />
    </div>
  )
}
