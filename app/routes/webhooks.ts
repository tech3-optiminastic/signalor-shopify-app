import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/shopify.server";

/**
 * Shopify webhook handler — app/uninstalled and mandatory compliance webhooks (GDPR).
 * authenticate.webhook verifies HMAC; invalid signatures must surface as 401 per Shopify requirements.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop } = await authenticate.webhook(request);

    switch (topic) {
      case "APP_UNINSTALLED":
      case "app/uninstalled":
        await prisma.session.deleteMany({ where: { shop } });
        console.log(`App uninstalled from ${shop} — sessions cleaned up`);
        break;

      case "CUSTOMERS_DATA_REQUEST":
      case "customers/data_request":
        // We do not persist customer PII; acknowledge for App Store compliance (respond 200).
        console.log(`customers/data_request for ${shop} — no stored customer data`);
        break;

      case "CUSTOMERS_REDACT":
      case "customers/redact":
        // Delete any shop-scoped data tied to customer if we add it later; none stored today.
        console.log(`customers/redact for ${shop} — acknowledged`);
        break;

      case "SHOP_REDACT":
      case "shop/redact":
        // 48h after uninstall — remove all app data for this shop (sessions + logs).
        await prisma.session.deleteMany({ where: { shop } });
        await prisma.fixLog.deleteMany({ where: { shop } });
        console.log(`shop/redact for ${shop} — shop data removed`);
        break;

      default:
        console.log(`Webhook ${topic} for ${shop}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}
