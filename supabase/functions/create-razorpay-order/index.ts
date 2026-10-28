import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (data: Record<string, unknown>, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!url || !serviceKey || !keyId || !keySecret) return reply({ success: false, error: "Card gateway configure नहीं है। Admin को Razorpay और Supabase secrets सेट करने होंगे।" }, 503);
    const body = await req.json();
    const bookingNumber = String(body.booking_number || "").trim();
    const token = String(body.payment_token || "").trim();
    const amount = Number(body.amount);
    if (!bookingNumber || !token || !Number.isFinite(amount) || amount <= 0) return reply({ success: false, error: "Booking या राशि अमान्य है।" }, 400);

    const dbGet = async (path: string) => {
      const r = await fetch(url + "/rest/v1/" + path, { headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey } });
      const data = await r.json().catch(() => []);
      if (!r.ok) throw new Error("Database read failed");
      return data;
    };
    const bookings = await dbGet("bookings?select=booking_number,amount,payment_token&booking_number=eq." + encodeURIComponent(bookingNumber) + "&payment_token=eq." + encodeURIComponent(token) + "&limit=1");
    const booking = bookings[0];
    if (!booking) return reply({ success: false, error: "Booking verification असफल हुई।" }, 404);
    const total = Number(booking.amount);
    if (!Number.isFinite(total) || total <= 0) return reply({ success: false, error: "Admin ने अभी Booking की राशि तय नहीं की है।" }, 400);
    const rows = await dbGet("payment_submissions?select=amount,status&booking_number=eq." + encodeURIComponent(bookingNumber));
    const good = new Set(["verified", "paid", "confirmed", "success", "successful"]);
    const verified = rows.reduce((s: number, row: {amount: unknown; status: unknown}) => good.has(String(row.status || "").toLowerCase()) ? s + Math.max(0, Number(row.amount) || 0) : s, 0);
    const remaining = Math.max(0, total - verified);
    const paise = Math.round(amount * 100);
    if (paise < 100 || amount > remaining + 0.001) return reply({ success: false, error: "राशि बाकी बकाया से अधिक है या अमान्य है।" }, 400);

    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(keyId + ":" + keySecret), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: paise, currency: "INR", receipt: ("AE-" + bookingNumber + "-" + Date.now()).slice(0, 40), notes: { booking_number: bookingNumber, payment_token: token } })
    });
    const order = await r.json().catch(() => ({}));
    if (!r.ok || !order.id) return reply({ success: false, error: "Razorpay order नहीं बन सका। Merchant Account/API keys जाँचें।" }, 502);
    return reply({ success: true, order_id: order.id, key_id: keyId, amount: order.amount, currency: order.currency });
  } catch (e) {
    console.error("create-razorpay-order failed", e);
    return reply({ success: false, error: "Secure payment order नहीं बन सका।" }, 500);
  }
});