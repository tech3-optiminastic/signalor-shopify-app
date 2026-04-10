import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, prisma } from "~/shopify.server";

/**
 * Mandatory GDPR / privacy compliance webhooks.
 * HMAC uses raw body via authenticate.webhook (do not parse JSON before verify).
 *
 * Shopify expects a fast 2xx: verify HMAC, return 200, then process side effects async.
 * @see https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop, webhookId } = await authenticate.webhook(request);

    void runComplianceEffects(topic, shop, webhookId).catch((err) => {
      console.error("[webhooks.compliance] async processing failed", {
        topic,
        shop,
        webhookId,
        err,
      });
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}

async function runComplianceEffects(
  topic: string,
  shop: string,
  webhookId: string | undefined,
) {
  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "customers/data_request":
      console.log("[webhooks.compliance] customers/data_request", { shop, webhookId });
      break;

    case "CUSTOMERS_REDACT":
    case "customers/redact":
      console.log("[webhooks.compliance] customers/redact", { shop, webhookId });
      break;

    case "SHOP_REDACT":
    case "shop/redact":
      await prisma.session.deleteMany({ where: { shop } });
      await prisma.fixLog.deleteMany({ where: { shop } });
      console.log("[webhooks.compliance] shop/redact — shop data removed", { shop, webhookId });
      break;

    default:
      console.warn("[webhooks.compliance] unexpected topic", { topic, shop, webhookId });
  }
}
