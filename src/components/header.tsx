"use client";

import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  children?: React.ReactNode;
}

export function Header({ title, children }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <div className="flex items-center gap-3">
        {children}
        {/* Cmd+K hint */}
        <button
          onClick={() =>
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true })
            )
          }
          className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted sm:flex"
        >
          <kbd className="font-sans">⌘K</kbd>
        </button>
        {/* User avatar placeholder */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          U
        </div>
      </div>
    </header>
  );
}
