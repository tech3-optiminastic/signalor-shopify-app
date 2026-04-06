import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/shopify.server";

/**
 * Splat route for App Proxy requests.
 *
 * Shopify App Proxy sends requests like:
 *   https://store.myshopify.com/apps/signalor/llms.txt
 *     → https://signalor-geo-app.onrender.com/api/llms.txt?shop=...&signature=...
 *
 * Remix flat routing uses dots as path separators, so "api.llms-txt.ts" becomes
 * /api/llms-txt (hyphen), not /api/llms.txt (dot). This splat route catches
 * all /api/* paths that don't match a specific route.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const splatPath = params["*"] || "";

  // Handle /api/llms.txt (served via App Proxy)
  if (splatPath === "llms.txt") {
    return handleLlmsTxt(url);
  }

  return new Response("Not found", { status: 404 });
}

async function handleLlmsTxt(url: URL) {
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("# llms.txt\n\nShop parameter required.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
  });

  if (!session?.accessToken) {
    return new Response("# llms.txt\n\nApp not installed on this store.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Fetch the metafield
  const resp = await fetch(
    `https://${shop}/admin/api/2025-04/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `#graphql
          query {
            shop {
              metafield(namespace: "signalor", key: "llms_txt") {
                value
              }
            }
          }
        `,
      }),
    },
  );

  const data = await resp.json();
  const content = data?.data?.shop?.metafield?.value;

  if (!content) {
    return new Response("# llms.txt\n\nNo content configured yet.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
