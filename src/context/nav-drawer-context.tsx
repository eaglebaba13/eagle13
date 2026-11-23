import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

interface NavDrawerContextType {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const NavDrawerContext = createContext<NavDrawerContextType | null>(null);

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  // Automatically close drawer when navigating to a new route
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <NavDrawerContext.Provider value={{ isOpen, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
    </NavDrawerContext.Provider>
  );
}

export function useNavDrawer(): NavDrawerContextType {
  const context = useContext(NavDrawerContext);
  if (!context) {
    // Fallback if rendered outside provider (defensive)
    return {
      isOpen: false,
      openDrawer: () => {},
      closeDrawer: () => {},
      toggleDrawer: () => {},
    };
  }
  return context;
}
