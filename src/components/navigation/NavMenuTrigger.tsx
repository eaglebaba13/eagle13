import { Menu } from "lucide-react";
import { useNavDrawer } from "@/context/nav-drawer-context";

export function NavMenuTrigger({ className }: { className?: string }) {
  const { toggleDrawer, isOpen } = useNavDrawer();

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-label="Toggle navigation menu"
      aria-expanded={isOpen}
      aria-controls="global-nav-drawer"
      title="Navigation Menu (≡)"
      className={`inline-flex items-center justify-center p-1.5 rounded-lg border border-border/60 bg-background/80 hover:bg-amber-500/10 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 transition-all cursor-pointer shrink-0 shadow-sm ${className ?? ""}`}
    >
      <Menu size={18} className="text-amber-400 hover:text-amber-300" />
    </button>
  );
}
