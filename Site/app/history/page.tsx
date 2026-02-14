import { Navbar } from "@/components/navbar"
import { TradeHistory } from "@/components/trade-history"

export default function HistoryPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="px-6 py-6">
        <TradeHistory />
      </div>
    </main>
  )
}

