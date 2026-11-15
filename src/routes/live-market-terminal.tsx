import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/live-market-terminal")({
  beforeLoad: () => {
    throw redirect({
      to: "/astro",
      search: { tab: "sessions" },
    });
  },
  component: () => null,
});
