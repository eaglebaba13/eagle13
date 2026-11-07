import { createFileRoute } from "@tanstack/react-router";
import { getFiiDiiData } from "@/lib/market-data/fii-dii.server";

export const Route = createFileRoute("/api/fii-dii")({
  server: {
    handlers: {
      GET: async () => {
        const data = await getFiiDiiData();
        return Response.json(
          {
            date: data.date,
            fii: data.fii,
            dii: data.dii,
            fno: data.fno,
            status: data.status,
          },
          {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=60, s-maxage=300",
            },
          },
        );
      },
    },
  },
});
