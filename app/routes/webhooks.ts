import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/shopify.server";

/**
 * Shopify webhook handler — handles app/uninstalled and GDPR events.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await prisma.session.deleteMany({ where: { shop } });
      console.log(`App uninstalled from ${shop} — sessions cleaned up`);
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      // GDPR compliance — we don't store customer data
      console.log(`GDPR webhook ${topic} for ${shop} — no action needed`);
      break;

    default:
      console.log(`Unhandled webhook: ${topic} for ${shop}`);
  }

  return new Response(null, { status: 200 });
}
