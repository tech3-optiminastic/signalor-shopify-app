import crypto from "crypto";
import { prisma } from "~/shopify.server";

interface AuthResult {
  shop: string;
  accessToken: string;
}

function signalorHmacSecret(): string | undefined {
  return (
    process.env.SIGNALOR_HMAC_SECRET?.trim() ||
    process.env.SIGNALOR_SHOPIFY_APP_HMAC_SECRET?.trim() ||
    process.env.SHOPIFY_API_SECRET?.trim()
  );
}

/**
 * Verify HMAC only (no session lookup). Use for POST /api/sync-session before a row exists.
 *
 * Header: X-Signalor-Signature = HMAC-SHA256(rawBody, secret)
 * Header: X-Signalor-Shop = mystore.myshopify.com
 *
 * Secret resolution (match Django `be`):
 * SIGNALOR_HMAC_SECRET → SIGNALOR_SHOPIFY_APP_HMAC_SECRET → SHOPIFY_API_SECRET
 */
export async function verifySignalorHmacRequest(
  request: Request,
): Promise<{ shop: string; body: Record<string, unknown>; rawBody: string }> {
  const signature = request.headers.get("X-Signalor-Signature");
  const shop = request.headers.get("X-Signalor-Shop");

  if (!signature || !shop) {
    throw new Response(
      JSON.stringify({
        status: "failed",
        message: "Missing X-Signalor-Signature or X-Signalor-Shop header",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const secret = signalorHmacSecret();
  if (!secret) {
    throw new Response(
      JSON.stringify({
        status: "failed",
        message: "No HMAC secret configured (SIGNALOR_HMAC_SECRET or SHOPIFY_API_SECRET)",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const rawBody = await request.text();

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))
  ) {
    throw new Response(
      JSON.stringify({ status: "failed", message: "Invalid HMAC signature" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Response(
      JSON.stringify({ status: "failed", message: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  return { shop, body, rawBody };
}

/**
 * Verify HMAC and load offline session from DB (for apply-fix, get-content).
 */
export async function authenticateSignalor(
  request: Request,
): Promise<{ auth: AuthResult; body: Record<string, unknown>; rawBody: string }> {
  const { shop, body, rawBody } = await verifySignalorHmacRequest(request);

  const sessions = await prisma.session.findMany({
    where: { shop, isOnline: false },
    orderBy: { id: "desc" },
    take: 1,
  });

  if (!sessions.length || !sessions[0].accessToken) {
    throw new Response(
      JSON.stringify({
        status: "failed",
        message: `No valid Shopify session for ${shop}. Reinstall the app or reconnect Shopify in Signalor.`,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  return {
    auth: { shop, accessToken: sessions[0].accessToken },
    body,
    rawBody,
  };
}
