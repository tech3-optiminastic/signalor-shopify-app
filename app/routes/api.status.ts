import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

/**
 * GET /api/status — Health check endpoint.
 * Mirrors WordPress plugin's GET /wp-json/signalor/v1/status
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const shop = request.headers.get("X-Signalor-Shop") || "unknown";

  return json({
    ok: true,
    plugin: "signalor-shopify",
    version: "1.0.0",
    platform: "shopify",
    shop,
  });
}
