"use client"

import { LogIn, Bug } from "lucide-react"

export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-card border-b border-border">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <Bug className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-foreground font-bold text-lg tracking-tight">
          Crypto<span className="text-primary">Bug</span>
        </span>
      </div>
      <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium tracking-wide uppercase">
        <LogIn className="h-4 w-4" />
        Login
      </button>
    </nav>
  )
}
