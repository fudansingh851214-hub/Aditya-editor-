# Razorpay Card Payment Setup (Aditya Editor)

The customer payment page now includes a Credit/Debit Card checkout flow. It is **not live until the merchant account, Supabase secrets, and Edge Functions below are configured and deployed**. Do not put the Razorpay Key Secret or Supabase service-role key in browser code or commit them to GitHub.

## 1. Create a Razorpay account
1. Create/activate a Razorpay merchant account and complete any required verification.
2. In Razorpay Dashboard, create API keys for **Test Mode** first.
3. Enable automatic capture for successful payments, or adapt the verification function to your capture setup.

## 2. Set Supabase Edge Function secrets
In Supabase Dashboard → Edge Functions → Secrets, set:
- RAZORPAY_KEY_ID = Razorpay Key ID (public identifier)
- RAZORPAY_KEY_SECRET = Razorpay Key Secret (keep private)
- SUPABASE_SERVICE_ROLE_KEY = the project's service-role/secret key (keep private)

SUPABASE_URL is normally available to Supabase Edge Functions automatically. If it is not, set it to the project URL.

## 3. Deploy both functions
From a computer with the Supabase CLI, linked to the correct project:

```sh
supabase functions deploy create-razorpay-order --no-verify-jwt
supabase functions deploy verify-razorpay-payment --no-verify-jwt
```

These functions validate the booking's payment token and amount server-side. The verify function checks the Razorpay signature and confirms the payment is captured before saving a verified payment record.

## 4. Test before live mode
1. Keep Razorpay in Test Mode and use its official test cards only.
2. Create a test booking and set the amount in Admin.
3. Open the customer payment page, find that booking, and select Credit/Debit Card.
4. Confirm a successful test payment appears as verified in payment_submissions and that the remaining balance updates.
5. Only after end-to-end tests pass, switch to Live Mode and use live API keys in Supabase secrets.

## Notes
- Card numbers, CVV, and OTP are entered in Razorpay Checkout, not stored by this website.
- Existing UPI QR, UTR, screenshot upload, and manual Admin verification remain available.
- Never share API secrets in chat, website HTML, JavaScript, or GitHub.
- If the project's payment_submissions table has different column names, update the Edge Function to match the actual schema before deployment.
