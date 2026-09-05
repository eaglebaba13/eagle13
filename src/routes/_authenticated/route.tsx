import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Route group for authenticated/research pages.
 * Authentication is disabled for the personal research terminal.
 * All routes are accessible without sign-in.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
