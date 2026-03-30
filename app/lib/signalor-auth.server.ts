import crypto from "crypto";
import { prisma } from "~/shopify.server";

interface AuthResult {
  shop: string;
  accessToken: string;
}

/**
 * Verify HMAC signature from Signalor backend and return shop + access token.
 *
 * Uses the shared SHOPIFY_API_SECRET as the HMAC key — both the Signalor backend
 * and this app know it (same developer). No per-shop secret exchange needed.
 *
 * Header: X-Signalor-Signature = HMAC-SHA256(body, SHOPIFY_API_SECRET)
 * Header: X-Signalor-Shop = mystore.myshopify.com
 */
export async function authenticateSignalor(
  request: Request,
): Promise<{ auth: AuthResult; body: Record<string, unknown>; rawBody: string }> {
  const signature = request.headers.get("X-Signalor-Signature");
  const shop = request.headers.get("X-Signalor-Shop");

  if (!signature || !shop) {
    throw new Response(
      JSON.stringify({ status: "failed", message: "Missing X-Signalor-Signature or X-Signalor-Shop header" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Use the shared app secret for HMAC verification
  // Backend signs with SHOPIFY_CLIENT_SECRET, app verifies with same value
  const secret = process.env.SIGNALOR_HMAC_SECRET || process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Response(
      JSON.stringify({ status: "failed", message: "SHOPIFY_API_SECRET not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const rawBody = await request.text();

  // Compute expected signature
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new Response(
      JSON.stringify({ status: "failed", message: "Invalid HMAC signature" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Get offline session access token for this shop
  const sessions = await prisma.session.findMany({
    where: { shop, isOnline: false },
    orderBy: { id: "desc" },
    take: 1,
  });

  if (!sessions.length || !sessions[0].accessToken) {
    throw new Response(
      JSON.stringify({ status: "failed", message: `No valid Shopify session for ${shop}. Reinstall the app.` }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  return {
    auth: { shop, accessToken: sessions[0].accessToken },
    body: JSON.parse(rawBody),
    rawBody,
  };
}
