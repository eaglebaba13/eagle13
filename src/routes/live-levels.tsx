import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/live-levels")({
  beforeLoad: () => {
    throw redirect({
      to: "/astro",
      search: { tab: "radar" },
    });
  },
  component: () => null,
});
