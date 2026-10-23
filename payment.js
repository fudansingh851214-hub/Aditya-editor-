
const SUPABASE_URL = "https://okzwtylpmcyurkxvaocy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_PjYL34jyFif4E6eHc7HYJQ_y-5SAs0q";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const bookingNumber =
  new URLSearchParams(window.location.search).get("id") || "";

const bookingLabel = document.getElementById("paymentBooking");
const message = document.getElementById("paymentMessage");
const submitButton = document.getElementById("submitPayment");

if (bookingLabel) {
  bookingLabel.textContent = bookingNumber
    ? "Booking: " + bookingNumber
    : "Booking number missing";
}

submitButton.addEventListener("click", async () => {
  const amount = Number(
    document.getElementById("paymentAmount").value
  );

  const utr = document
    .getElementById("paymentUTR")
    .value.trim();

  if (!bookingNumber) {
    message.textContent = "Booking number missing hai.";
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    message.textContent = "Sahi payment amount daalein.";
    return;
  }

  if (!/^[a-zA-Z0-9-]{6,40}$/.test(utr)) {
    message.textContent = "Valid UTR number daalein.";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "Submitting...";

  try {
    const { error } = await client
      .from("payment_submissions")
      .insert({
        booking_number: bookingNumber,
        utr: utr,
        amount: amount
      });

    if (error) throw error;

    message.textContent =
      "Details submitted. Payment status: Pending verification.";

    document.getElementById("paymentUTR").value = "";
  } catch (error) {
    console.error(error);

    message.textContent =
      error.code === "23505"
        ? "Ye UTR pehle submit ho chuka hai."
        : "Submit nahi hua. Database settings check karein.";
  } finally {
    submitButton.disabled = false;
  }
});
