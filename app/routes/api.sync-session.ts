import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifySignalorHmacRequest } from "~/lib/signalor-auth.server";
import { prisma } from "~/shopify.server";

/**
 * POST /api/sync-session
 *
 * Called by the Signalor backend after OAuth to sync the access token
 * into the Shopify app's session storage.
 *
 * This ensures the app can make GraphQL calls to apply fixes,
 * even when the user installed via the Signalor dashboard (not the app directly).
 *
 * Body: { "shop": "store.myshopify.com", "accessToken": "shpca_...", "scope": "..." }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ status: "failed", message: "POST only" }, 405);
  }

  try {
    // HMAC only — cannot use authenticateSignalor() here (no Prisma session row yet).
    const { body } = await verifySignalorHmacRequest(request);

    const shop = body.shop as string;
    const accessToken = body.accessToken as string;
    const scope = (body.scope as string) || "";

    if (!shop || !accessToken) {
      return json({ status: "failed", message: "shop and accessToken required" }, 400);
    }

    const sessionId = `offline_${shop}`;

    // Upsert the offline session
    await prisma.session.upsert({
      where: { id: sessionId },
      update: {
        accessToken,
        scope,
        isOnline: false,
        state: "synced",
      },
      create: {
        id: sessionId,
        shop,
        state: "synced",
        isOnline: false,
        scope,
        accessToken,
      },
    });

    return json({ status: "success", message: `Session synced for ${shop}` });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("sync-session error:", error);
    return json({ status: "failed", message: String(error) }, 500);
  }
}

export async function loader() {
  return json({ error: "POST only" }, 405);
}
