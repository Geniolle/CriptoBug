"use client"

const exchanges = [
  {
    name: "Binance",
    color: "#F0B90B",
    logo: (
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
        <rect width="32" height="32" rx="6" fill="#F0B90B" />
        <path
          d="M16 6l3.09 3.09L13.18 15l-3.09-3.09L16 6zm5.91 5.91L25 15l-3.09 3.09-5.91-5.91 3.09-3.09v-.18zM7 15l3.09-3.09 3.09 3.09L10.09 18.09 7 15zm8.91 2.91L19.09 21.09 16 24.18l-3.09-3.09 3.09-3.09-.09-.09zM16 13.18L18.82 16 16 18.82 13.18 16 16 13.18z"
          fill="#1E2026"
        />
      </svg>
    ),
  },
  {
    name: "Kraken",
    color: "#7B61FF",
    logo: (
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
        <rect width="32" height="32" rx="6" fill="#7B61FF" />
        <path
          d="M16 7c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 14.5c-3.04 0-5.5-2.46-5.5-5.5S12.96 10.5 16 10.5s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5zm0-8a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"
          fill="white"
        />
      </svg>
    ),
  },
  {
    name: "OKX",
    color: "#FFFFFF",
    logo: (
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
        <rect width="32" height="32" rx="6" fill="#000000" />
        <rect x="8" y="8" width="5" height="5" rx="1" fill="white" />
        <rect x="13.5" y="8" width="5" height="5" rx="1" fill="white" />
        <rect x="19" y="8" width="5" height="5" rx="1" fill="white" />
        <rect x="8" y="13.5" width="5" height="5" rx="1" fill="white" />
        <rect x="19" y="13.5" width="5" height="5" rx="1" fill="white" />
        <rect x="8" y="19" width="5" height="5" rx="1" fill="white" />
        <rect x="13.5" y="19" width="5" height="5" rx="1" fill="white" />
        <rect x="19" y="19" width="5" height="5" rx="1" fill="white" />
      </svg>
    ),
  },
  {
    name: "Bybit",
    color: "#F7A600",
    logo: (
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
        <rect width="32" height="32" rx="6" fill="#F7A600" />
        <path
          d="M10 10h4v4h-4v-4zm0 8h4v4h-4v-4zm8-8h4v4h-4v-4zm-4 4h4v4h-4v-4zm8 4h4v4h-4v-4z"
          fill="#1E2026"
        />
      </svg>
    ),
  },
]

export function ExchangeCarousel() {
  // On very wide screens, the ticker track can become shorter than the viewport.
  // We repeat the base list to ensure the marquee always covers the full width.
  const base = Array.from({ length: 12 }, () => exchanges).flat()
  const track = [...base, ...base]

  return (
    <div className="mx-6 my-4 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="relative overflow-hidden py-4">
        <div className="absolute left-0 top-0 bottom-0 w-12 z-10" style={{ background: "linear-gradient(to right, hsl(0 0% 7%), transparent)" }} />
        <div className="absolute right-0 top-0 bottom-0 w-12 z-10" style={{ background: "linear-gradient(to left, hsl(0 0% 7%), transparent)" }} />
        <div className="flex animate-scroll-carousel" style={{ width: "max-content" }}>
          {track.map((exchange, index) => (
            <div
              key={`${exchange.name}-${index}`}
              className="flex items-center gap-3 px-8 shrink-0"
            >
              <div className="flex items-center justify-center rounded-lg overflow-hidden shrink-0">
                {exchange.logo}
              </div>
              <span className="text-foreground font-medium text-sm whitespace-nowrap">
                {exchange.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
