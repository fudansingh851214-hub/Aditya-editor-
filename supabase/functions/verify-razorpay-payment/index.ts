import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (data: Record<string, unknown>, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
}
async function dbRequest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(url + "/rest/v1/" + path, { ...init, headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error("Database request failed");
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const secret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!url || !serviceKey || !keyId || !secret) return reply({ success: false, error: "Card gateway configure नहीं है।" }, 503);
    const body = await req.json();
    const bookingNumber = String(body.booking_number || "").trim();
    const token = String(body.payment_token || "").trim();
    const orderId = String(body.razorpay_order_id || "").trim();
    const paymentId = String(body.razorpay_payment_id || "").trim();
    const signature = String(body.razorpay_signature || "").trim();
    if (!bookingNumber || !token || !orderId || !paymentId || !signature) return reply({ success: false, error: "Payment verification details अधूरे हैं।" }, 400);
    const expected = await hmac(secret, orderId + "|" + paymentId);
    if (expected.length !== signature.length || !expected.split("").every((c, i) => c === signature[i])) return reply({ success: false, error: "Payment signature सही नहीं है।" }, 400);

    const auth = "Basic " + btoa(keyId + ":" + secret);
    const [or, pr] = await Promise.all([
      fetch("https://api.razorpay.com/v1/orders/" + encodeURIComponent(orderId), { headers: { Authorization: auth } }),
      fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(paymentId), { headers: { Authorization: auth } })
    ]);
    const order = await or.json().catch(() => ({}));
    const payment = await pr.json().catch(() => ({}));
    if (!or.ok || !pr.ok || order.id !== orderId || payment.id !== paymentId || payment.order_id !== orderId || payment.status !== "captured" || order.status !== "paid" || order.notes?.booking_number !== bookingNumber || order.notes?.payment_token !== token || payment.currency !== "INR" || payment.amount !== order.amount) return reply({ success: false, error: "Razorpay ने captured payment की पुष्टि नहीं की।" }, 400);

    const bookings = await dbRequest("bookings?select=booking_number,amount,payment_token&booking_number=eq." + encodeURIComponent(bookingNumber) + "&payment_token=eq." + encodeURIComponent(token) + "&limit=1");
    const booking = bookings?.[0];
    if (!booking) return reply({ success: false, error: "Booking verification असफल हुई।" }, 404);
    const reference = "razorpay:" + paymentId;
    const existing = await dbRequest("payment_submissions?select=id&payment_reference=eq." + encodeURIComponent(reference) + "&limit=1");
    if (!existing?.length) {
      await dbRequest("payment_submissions", { method: "POST", body: JSON.stringify({ booking_number: bookingNumber, amount: Number(payment.amount) / 100, status: "verified", payment_reference: reference, utr: null, verified_at: new Date().toISOString() }) });
    }
    const rows = await dbRequest("payment_submissions?select=amount,status&booking_number=eq." + encodeURIComponent(bookingNumber));
    const good = new Set(["verified", "paid", "confirmed", "success", "successful"]);
    const paid = rows.reduce((s: number, row: {amount: unknown; status: unknown}) => good.has(String(row.status || "").toLowerCase()) ? s + Math.max(0, Number(row.amount) || 0) : s, 0);
    if (paid + 0.001 >= Number(booking.amount)) await dbRequest("bookings?booking_number=eq." + encodeURIComponent(bookingNumber), { method: "PATCH", body: JSON.stringify({ payment_status: "paid" }) });
    return reply({ success: true, verified: true, payment_id: paymentId, amount: Number(payment.amount) / 100 });
  } catch (e) {
    console.error("verify-razorpay-payment failed", e);
    return reply({ success: false, error: "Payment की सुरक्षित पुष्टि नहीं हो सकी। Admin से संपर्क करें।" }, 500);
  }
});