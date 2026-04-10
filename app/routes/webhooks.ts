import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, prisma } from "~/shopify.server";

/**
 * `app/uninstalled` — compliance topics are handled by webhooks.compliance.ts.
 * Return 200 quickly; session cleanup runs async after HMAC verification.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop, webhookId } = await authenticate.webhook(request);

    switch (topic) {
      case "APP_UNINSTALLED":
      case "app/uninstalled":
        void runUninstallEffects(shop, webhookId).catch((err) => {
          console.error("[webhooks] app/uninstalled async failed", { shop, webhookId, err });
        });
        break;

      default:
        console.log(`[webhooks] ${topic} for ${shop}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}

async function runUninstallEffects(shop: string, webhookId: string | undefined) {
  await prisma.session.deleteMany({ where: { shop } });
  console.log("[webhooks] app/uninstalled — sessions removed", { shop, webhookId });
}
