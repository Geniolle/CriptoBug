import { Navbar } from "@/components/navbar"
import { ExchangeCarousel } from "@/components/exchange-carousel"
import { TopAssetsDashboard } from "@/components/top-assets-dashboard"

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <ExchangeCarousel />
      <TopAssetsDashboard />
    </main>
  )
}
