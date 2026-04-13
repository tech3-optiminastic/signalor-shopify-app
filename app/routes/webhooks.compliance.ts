import type { ActionFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { prisma } from "~/shopify.server";

/**
 * Mandatory Shopify GDPR / privacy compliance webhooks.
 *
 * These endpoints MUST:
 *  1. Verify the X-Shopify-Hmac-Sha256 header (HMAC-SHA256 of raw body with API secret)
 *  2. Return 200 quickly
 *  3. Handle: customers/data_request, customers/redact, shop/redact
 *
 * We do NOT use authenticate.webhook() here because Shopify's verification bot
 * may send test payloads without a valid session — manual HMAC is required.
 *
 * @see https://shopify.dev/docs/apps/build/privacy-law-compliance
 */

function verifyHmac(rawBody: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("[compliance] SHOPIFY_API_SECRET not set — cannot verify HMAC");
    return false;
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "utf8"),
      Buffer.from(hmacHeader, "utf8"),
    );
  } catch {
    return false;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256") || "";

  // Step 1: Verify HMAC signature
  if (!verifyHmac(rawBody, hmacHeader)) {
    console.error("[compliance] HMAC verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  // Step 2: Parse payload and identify topic
  const topic = request.headers.get("X-Shopify-Topic") || "";
  const shop = request.headers.get("X-Shopify-Shop-Domain") || "unknown";

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // empty or malformed body — still return 200 for verification pings
  }

  console.log(`[compliance] ${topic} from ${shop}`);

  // Step 3: Handle each mandatory topic
  switch (topic) {
    case "customers/data_request": {
      // Merchant requests what customer data we store.
      // Signalor does not store personal customer data — nothing to report.
      const customerId = (payload as { customer?: { id?: number } })?.customer?.id;
      console.log(`[compliance] customers/data_request — customer ${customerId}, shop ${shop}`);
      break;
    }

    case "customers/redact": {
      // Merchant requests deletion of a specific customer's data.
      // Signalor does not store personal customer data — nothing to delete.
      const customerId = (payload as { customer?: { id?: number } })?.customer?.id;
      console.log(`[compliance] customers/redact — customer ${customerId}, shop ${shop}`);
      break;
    }

    case "shop/redact": {
      // 48 hours after app uninstall — delete all shop data.
      await prisma.session.deleteMany({ where: { shop } });
      console.log(`[compliance] shop/redact — shop data deleted for ${shop}`);
      break;
    }

    default:
      console.log(`[compliance] unhandled topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
}
