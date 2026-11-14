const PRICE_CENTS_PER_DEVICE = 35000;
const SHIPPING_CENTS = 2000;
const COUPON_CODE = "ECOLOGIE";

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function deliveryDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + 5, 12));
  const iso = date.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  return { iso, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

function calculateOrder(quantity: number, coupon: boolean) {
  const subtotal = PRICE_CENTS_PER_DEVICE * quantity;
  const discount = coupon ? Math.round(subtotal * 0.25) : 0;
  const taxable = subtotal - discount + SHIPPING_CENTS;
  const gst = Math.round(taxable * 0.05);
  const qst = Math.round(taxable * 0.09975);
  const total = taxable + gst + qst;
  if (![subtotal, discount, taxable, gst, qst, total].every(Number.isSafeInteger)) {
    throw new Error("Order amount is outside supported range");
  }
  return { subtotal, discount, shipping: SHIPPING_CENTS, gst, qst, total };
}

function money(cents: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = Deno.env.get("APP_ORIGIN") || "";
  if (!allowedOrigin || origin !== allowedOrigin) {
    return jsonResponse({ error: "Origin is not allowed" }, 403, "null");
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const sender = Deno.env.get("RESEND_FROM_EMAIL") || "";
  if (!supabaseUrl || !supabaseAnonKey || !resendApiKey || !sender) {
    return jsonResponse({ error: "Email service is not configured" }, 503, allowedOrigin);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sign-in is required" }, 401, allowedOrigin);
  }

  const userResponse = await fetch(supabaseUrl.replace(/\/+$/, "") + "/auth/v1/user", {
    headers: { apikey: supabaseAnonKey, Authorization: authorization },
  });
  if (!userResponse.ok) {
    return jsonResponse({ error: "Sign-in could not be verified" }, 401, allowedOrigin);
  }
  const user = await userResponse.json();
  if (!user.email || !user.email_confirmed_at) {
    return jsonResponse({ error: "A verified email address is required" }, 403, allowedOrigin);
  }

  let input: { quantity?: number; coupon_code?: string };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400, allowedOrigin);
  }
  if (!input || typeof input !== "object") {
    return jsonResponse({ error: "Invalid request body" }, 400, allowedOrigin);
  }
  const quantity = Number(input.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return jsonResponse({ error: "Quantity must be a positive whole number" }, 400, allowedOrigin);
  }
  const code = String(input.coupon_code || "").trim().toUpperCase();
  if (code && code !== COUPON_CODE) {
    return jsonResponse({ error: "Coupon code is invalid" }, 400, allowedOrigin);
  }

  let order;
  try {
    order = calculateOrder(quantity, code === COUPON_CODE);
  } catch {
    return jsonResponse({ error: "Order total is outside the supported range" }, 400, allowedOrigin);
  }
  const delivery = deliveryDate();
  const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
  const rows = [
    `<tr><td>Appareils (${quantity} × ${money(PRICE_CENTS_PER_DEVICE)})</td><td>${money(order.subtotal)}</td></tr>`,
    ...(order.discount ? [`<tr><td>Réduction ECOLOGIE (25 %)</td><td>−${money(order.discount)}</td></tr>`] : []),
    `<tr><td>Livraison</td><td>${money(order.shipping)}</td></tr>`,
    `<tr><td>TPS (5 %)</td><td>${money(order.gst)}</td></tr>`,
    `<tr><td>TVQ (9,975 %)</td><td>${money(order.qst)}</td></tr>`,
  ].join("");
  const subject = "Votre récapitulatif de réservation Voltix";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#111">
      <h1>Merci pour votre intérêt envers Voltix</h1>
      <p>Votre récapitulatif de réservation est prêt. Aucun paiement n’a été demandé ni prélevé.</p>
      <p><strong>Référence :</strong> ${reference}</p>
      <table style="width:100%;border-collapse:collapse">
        ${rows}
        <tr><td style="padding-top:12px"><strong>Valeur estimée</strong></td><td style="padding-top:12px"><strong>${money(order.total)}</strong></td></tr>
      </table>
      <p><strong>Livraison estimée au plus tard le :</strong> ${delivery.label}</p>
      <p>Cette estimation est calculée à partir d’un délai maximal de cinq jours calendrier. La date réelle reste à confirmer.</p>
      <p>Ce courriel confirme votre demande; il ne constitue pas une facture acquittée ni un engagement de livraison.</p>
      <p>Merci,<br>L’équipe Voltix</p>
    </div>`;
  const text = [
    "Merci pour votre intérêt envers Voltix.",
    "Votre récapitulatif de réservation est prêt. Aucun paiement n’a été demandé ni prélevé.",
    `Référence : ${reference}`,
    `Appareils (${quantity} × ${money(PRICE_CENTS_PER_DEVICE)}) : ${money(order.subtotal)}`,
    ...(order.discount ? [`Réduction ECOLOGIE (25 %) : -${money(order.discount)}`] : []),
    `Livraison : ${money(order.shipping)}`,
    `TPS (5 %) : ${money(order.gst)}`,
    `TVQ (9,975 %) : ${money(order.qst)}`,
    `Valeur estimée : ${money(order.total)}`,
    `Livraison estimée au plus tard le ${delivery.label}; date réelle à confirmer.`,
    "Ce courriel confirme votre demande; il ne constitue pas une facture acquittée ni un engagement de livraison.",
    "Merci, l’équipe Voltix",
  ].join("\n");

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: sender, to: [user.email], subject, html, text }),
  });
  if (!emailResponse.ok) {
    console.error("Resend email request failed with status", emailResponse.status);
    return jsonResponse({ error: "Confirmation email could not be sent" }, 502, allowedOrigin);
  }
  return jsonResponse({ sent: true, delivery_date: delivery.iso, total_cad: order.total / 100 }, 200, allowedOrigin);
});
