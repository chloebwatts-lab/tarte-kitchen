"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Carrot,
  ChefHat,
  UtensilsCrossed,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchItem {
  id: string;
  name: string;
  type: "ingredient" | "preparation" | "dish";
  href: string;
}

const placeholderItems: SearchItem[] = [
  { id: "1", name: "All-Purpose Flour", type: "ingredient", href: "/ingredients/1" },
  { id: "2", name: "Unsalted Butter", type: "ingredient", href: "/ingredients/2" },
  { id: "3", name: "Vanilla Extract", type: "ingredient", href: "/ingredients/3" },
  { id: "4", name: "Heavy Cream", type: "ingredient", href: "/ingredients/4" },
  { id: "5", name: "Pastry Cream", type: "preparation", href: "/preparations/1" },
  { id: "6", name: "Pate Sucree", type: "preparation", href: "/preparations/2" },
  { id: "7", name: "Caramel Sauce", type: "preparation", href: "/preparations/3" },
  { id: "8", name: "Tarte au Citron", type: "dish", href: "/dishes/1" },
  { id: "9", name: "Paris-Brest", type: "dish", href: "/dishes/2" },
  { id: "10", name: "Croissant", type: "dish", href: "/dishes/3" },
];

const typeConfig = {
  ingredient: { label: "Ingredient", icon: Carrot, badgeClass: "bg-green-light text-green-text" },
  preparation: { label: "Preparation", icon: ChefHat, badgeClass: "bg-amber-light text-amber-text" },
  dish: { label: "Dish", icon: UtensilsCrossed, badgeClass: "bg-blue-100 text-blue-800" },
};

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const grouped = {
    ingredient: placeholderItems.filter((i) => i.type === "ingredient"),
    preparation: placeholderItems.filter((i) => i.type === "preparation"),
    dish: placeholderItems.filter((i) => i.type === "dish"),
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          <Command className="flex flex-col" shouldFilter={true}>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                placeholder="Search ingredients, preparations, dishes..."
                className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>
              {(Object.keys(grouped) as Array<keyof typeof grouped>).map(
                (type) => (
                  <Command.Group
                    key={type}
                    heading={typeConfig[type].label + "s"}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {grouped[type].map((item) => {
                      const Icon = typeConfig[item.type].icon;
                      return (
                        <Command.Item
                          key={item.id}
                          value={item.name}
                          onSelect={() => handleSelect(item.href)}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground aria-selected:bg-muted"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1">{item.name}</span>
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                              typeConfig[item.type].badgeClass
                            )}
                          >
                            {typeConfig[item.type].label}
                          </span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
