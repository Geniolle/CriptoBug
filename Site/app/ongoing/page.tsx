import { Navbar } from "@/components/navbar"
import { TradeOngoing } from "@/components/trade-ongoing"

export default function OngoingPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="px-6 py-6">
        <TradeOngoing />
      </div>
    </main>
  )
}

