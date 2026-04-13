import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, prisma } from "~/shopify.server";

/**
 * Mandatory Shopify GDPR / privacy compliance webhooks.
 *
 * HMAC verification is handled by authenticate.webhook() which uses
 * the apiSecretKey configured in shopifyApp().
 *
 * Returns 200 immediately — side effects run async.
 *
 * @see https://shopify.dev/docs/apps/build/privacy-law-compliance
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop } = await authenticate.webhook(request);

  // Return 200 immediately — side effects run async
  void processComplianceWebhook(topic, shop).catch((err) => {
    console.error("[compliance] async processing failed", { topic, shop, err });
  });

  return new Response(null, { status: 200 });
}

async function processComplianceWebhook(topic: string, shop: string) {
  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      console.log("[compliance] customers/data_request", { shop });
      // Signalor does not store personal customer data — nothing to report
      break;

    case "CUSTOMERS_REDACT":
      console.log("[compliance] customers/redact", { shop });
      // Signalor does not store personal customer data — nothing to delete
      break;

    case "SHOP_REDACT":
      await prisma.session.deleteMany({ where: { shop } });
      console.log("[compliance] shop/redact — shop data deleted", { shop });
      break;

    default:
      console.log("[compliance] unhandled topic", { topic, shop });
  }
}
