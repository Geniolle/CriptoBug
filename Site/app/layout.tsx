import type { Metadata, Viewport } from 'next'
import { Inter, Space_Mono } from 'next/font/google'

import { AuthProvider } from '@/components/auth-provider'
import './globals.css'

const _inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const _spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-space-mono' })

export const metadata: Metadata = {
  title: 'CryptoBug - Portfolio Dashboard',
  description: 'Track your cryptocurrency portfolio across Binance, Coinbase, Kraken, OKX, and Bybit',
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${_inter.variable} ${_spaceMono.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
