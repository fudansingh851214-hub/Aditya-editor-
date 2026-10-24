
"use strict";

/* ==========================================
   ADITYA EDITOR — ADMIN PANEL
   Login | Bookings | Customer Files
   Payment Verification | Service Gallery
========================================== */

const SUPABASE_URL =
  "https://okzwtylpmcyurkxvaocy.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_PjYL34jyFif4E6eHc7HYJQ_y-5SAs0q";

const STORAGE_BUCKET = "customer-media";
const GALLERY_BUCKET = "service-gallery";
const GALLERY_TABLE = "service_gallery";
const SIGNED_URL_SECONDS = 3600;

const BOOKING_STATUSES = [
  "Booking Submitted",
  "Booking Confirmed",
  "Payment Confirmed",
  "Editing In Progress",
  "Ready for Delivery",
  "Completed"
];

const GALLERY_SERVICES = [
  "Photo Editing",
  "Video Editing",
  "Wedding Projects",
  "Graphic Design",
  "Social Media Reels"
];

const db = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

let bookingsBusy = false;
let paymentsBusy = false;
let galleryBusy = false;
let currentBookings = [];

const loginPanel = $("loginPanel");
const adminDashboard = $("adminDashboard");
const loginForm = $("loginForm");
const adminEmail = $("adminEmail");
const adminPassword = $("adminPassword");
const loginMessage = $("loginMessage");
const logoutButton = $("logoutButton");

const refreshButton = $("refreshButton");
const message = $("message");
const bookingsList = $("bookingsList");

const refreshPaymentsButton = $("refreshPaymentsButton");
const paymentFilter = $("paymentFilter");
const paymentMessage = $("paymentMessage");
const paymentsList = $("paymentsList");

const galleryUploadForm = $("galleryUploadForm");
const galleryTitle = $("galleryTitle");
const galleryService = $("galleryService");
const galleryFile = $("galleryFile");
const galleryUploadButton = $("galleryUploadButton");
const galleryMessage = $("galleryMessage");
const galleryAdminList = $("galleryAdminList");
const refreshGalleryButton = $("refreshGalleryButton");

/* ---------- HELPERS ---------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.style.color = isError ? "#ff8585" : "#42dfff";
  element.style.whiteSpace = "pre-wrap";
}

function getErrorText(error) {
  if (!error) return "Unknown error";
  return [
    error.message,
    error.details,
    error.hint,
    error.code ? "Code: " + error.code : ""
  ].filter(Boolean).join(" | ");
}

function formatAmount(value) {
  if (value === null || value === undefined || value === "") {
    return "निर्धारित नहीं";
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(number);
}

function formatDate(value) {
  if (!value) return "उपलब्ध नहीं";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function makeElement(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = String(text);
  return element;
}

function addField(parent, label, value) {
  const p = makeElement("p");
  const strong = makeElement("strong", "", label + ": ");
  p.append(strong, document.createTextNode(String(value ?? "उपलब्ध नहीं")));
  parent.appendChild(p);
}

function setButtonBusy(button, busy, busyText, normalText) {
  if (!button) return;

  if (busy) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    button.textContent = busyText || "Loading...";
  } else {
    button.disabled = false;
    button.textContent =
      button.dataset.originalText || normalText || "Refresh";
    delete button.dataset.originalText;
  }
}

function normalizeStatus(status) {
  return BOOKING_STATUSES.includes(status)
    ? status
    : BOOKING_STATUSES[0];
}

function parseFilePaths(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return [value];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [value.trim()].filter(Boolean);
    }
  }

  return [];
}

function makeActionButton(text, className, callback) {
  const button = makeElement("button", className, text);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}

/* ---------- LOGIN VISIBILITY ---------- */

function showLogin() {
  if (loginPanel) {
    loginPanel.classList.remove("hidden");
    loginPanel.style.display = "block";
  }

  if (adminDashboard) {
    adminDashboard.classList.add("hidden");
    adminDashboard.style.display = "none";
  }
}

function showDashboard() {
  if (loginPanel) {
    loginPanel.classList.add("hidden");
    loginPanel.style.display = "none";
  }

  if (adminDashboard) {
    adminDashboard.classList.remove("hidden");
    adminDashboard.style.display = "block";
  }
}

/* ---------- ADMIN AUTHORIZATION ---------- */

async function verifyAdmin() {
  if (!db) {
    throw new Error(
      "Supabase initialize नहीं हुआ। Supabase library और URL जाँचें।"
    );
  }

  const { data, error } = await db.auth.getUser();
  if (error) throw error;

  if (!data?.user) {
    throw new Error("आपका session नहीं मिला। दोबारा Login करें।");
  }

  const result = await db.rpc("is_admin");

  if (result.error) {
    throw new Error(
      "Admin permission जाँचने में समस्या। is_admin() function जाँचें: " +
      getErrorText(result.error)
    );
  }

  if (result.data !== true) {
    throw new Error("इस account को Admin permission नहीं मिली है।");
  }

  return data.user;
}

/* ---------- LOGIN ---------- */

async function handleLogin(event) {
  event.preventDefault();

  if (!db) {
    showMessage(loginMessage, "Supabase library लोड नहीं हुई।", true);
    return;
  }

  const email = adminEmail?.value.trim();
  const password = adminPassword?.value;

  if (!email || !password) {
    showMessage(loginMessage, "Email और Password भरें।", true);
    return;
  }

  const submitButton = loginForm?.querySelector(
    'button[type="submit"]'
  );

  setButtonBusy(submitButton, true, "Logging in...", "LOGIN");
  showMessage(loginMessage, "Login जाँचा जा रहा है...");

  try {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await verifyAdmin();

    showDashboard();
    showMessage(loginMessage, "Admin Login सफल हुआ।");

    await loadAllAdminData();
  } catch (error) {
    try {
      await db.auth.signOut();
    } catch (_) {
      // Login error is displayed below.
    }

    showLogin();
    showMessage(
      loginMessage,
      "Login नहीं हुआ: " + getErrorText(error),
      true
    );
  } finally {
    setButtonBusy(submitButton, false, "", "LOGIN");
  }
}

async function handleLogout() {
  if (!db) return;

  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    showLogin();
    if (loginForm) loginForm.reset();

    showMessage(loginMessage, "आप Logout हो गए हैं।");
  } catch (error) {
    showMessage(
      loginMessage,
      "Logout समस्या: " + getErrorText(error),
      true
    );
  }
}

/* ---------- INITIAL SESSION CHECK ---------- */

async function initializeAdmin() {
  // पेज खुलते ही Login दिखाएँ। पहले से authorized session
  // सत्यापित होने पर ही Dashboard दिखेगा।
  showLogin();

  if (!db) {
    showMessage(
      loginMessage,
      "Supabase library लोड नहीं हुई। Internet और script tag जाँचें।",
      true
    );
    return;
  }

  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    if (!data?.session) {
      showLogin();
      return;
    }

    await verifyAdmin();
    showDashboard();
    showMessage(loginMessage, "Admin session सत्यापित हुआ।");

    await loadAllAdminData();
  } catch (error) {
    showLogin();
    showMessage(
      loginMessage,
      "Session सत्यापित नहीं हुआ: " + getErrorText(error),
      true
    );
  }
}

async function loadAllAdminData() {
  // पहले bookings लोड करें ताकि payment cards customer details से link हो सकें।
  const results = [];
  results.push(await Promise.allSettled([loadBookings()]));
  results.push(await Promise.allSettled([loadPayments()]));
  results.push(await Promise.allSettled([loadServiceGallery()]));
  return results;
}

/* ---------- BOOKINGS ---------- */

async function loadBookings() {
  if (bookingsBusy || !db || adminDashboard?.classList.contains("hidden")) {
    return;
  }

  bookingsBusy = true;
  setButtonBusy(refreshButton, true, "Loading...", "Refresh Bookings");
  showMessage(message, "Bookings लोड हो रही हैं...");

  if (bookingsList) {
    bookingsList.textContent = "कृपया प्रतीक्षा करें...";
  }

  try {
    await verifyAdmin();

    const { data, error } = await db
      .from("bookings")
      .select(
        "id, booking_number, customer_name, phone, email, address, user_id, service, status, booking_status, payment_status, payment_reference, file_paths, created_at, amount"
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    currentBookings = data || [];
    const { data: paymentRows, error: paymentError } = await db.from("payment_submissions")
      .select("id, booking_number, amount, status, utr, payment_reference, screenshot_path, created_at, verified_at, verified_by");
    if (paymentError) throw paymentError;
    const allPayments = paymentRows || [];
    currentBookings = currentBookings.map((booking) => {
      const payments = allPayments.filter((p) => p.booking_number === booking.booking_number);
      const verifiedStatuses = ["paid", "verified", "confirmed", "success", "successful"];
      const pendingStatuses = ["pending", "submitted", "under_review", "review"];
      const paid = payments.filter((p) => verifiedStatuses.includes(String(p.status || "").toLowerCase())).reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
      const pending = payments.filter((p) => pendingStatuses.includes(String(p.status || "").toLowerCase())).reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
      return { ...booking, _payments: payments, _paidAmount: paid, _pendingAmount: pending, _remainingAmount: Math.max(0, (Number(booking.amount) || 0) - paid) };
    });
    renderBookings(currentBookings);
    showMessage(message, `${currentBookings.length} Booking records मिले।`);
  } catch (error) {
    if (bookingsList) {
      bookingsList.replaceChildren();
      bookingsList.textContent =
        "Bookings नहीं खुलीं: " + getErrorText(error);
    }

    showMessage(
      message,
      "Bookings नहीं खुलीं: " + getErrorText(error),
      true
    );
  } finally {
    bookingsBusy = false;
    setButtonBusy(refreshButton, false, "", "Refresh Bookings");
  }
}

function renderBookings(bookings) {
  if (!bookingsList) return;
  bookingsList.replaceChildren();

  if (!bookings.length) {
    bookingsList.textContent = "अभी कोई Booking नहीं मिली।";
    return;
  }

  for (const booking of bookings) {
    const article = makeElement("article", "record");

    article.appendChild(
      makeElement(
        "h3",
        "",
        "Booking: " + (booking.booking_number || booking.id)
      )
    );

    addField(article, "Customer Name", booking.customer_name);
    addField(article, "Email", booking.email);
    addField(article, "Mobile", booking.phone);
    addField(article, "Address", booking.address);
    addField(article, "Customer Account ID", booking.user_id);
    addField(article, "Service / Category", booking.service);

    // Photo/video quantities are shown for every service, including Wedding Projects,
    // Graphic Design, and Social Media Reels.
    article.appendChild(
      makeElement(
        "h4",
        "",
        "Photo / Video Quantity — सभी Services"
      )
    );
    const customerFiles = parseFilePaths(booking.file_paths);
    const fileNames = customerFiles.map((file) => {
      if (typeof file === "string") return file;
      return file?.path || file?.file_path || file?.name || file?.url || "";
    }).filter(Boolean);
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "heic"];
    const videoExtensions = ["mp4", "webm", "mov", "m4v", "ogv", "avi", "mkv"];
    let photoCount = 0;
    let videoCount = 0;
    let otherCount = 0;
    for (const fileName of fileNames) {
      const cleanName = String(fileName).split("?")[0].split("#")[0];
      const extension = cleanName.includes(".")
        ? cleanName.split(".").pop().toLowerCase()
        : "";
      if (imageExtensions.includes(extension)) photoCount++;
      else if (videoExtensions.includes(extension)) videoCount++;
      else otherCount++;
    }
    addField(article, "Selected / Uploaded Files", fileNames.length);
    addField(article, "Photos Quantity", photoCount);
    addField(article, "Videos Quantity", videoCount);
    if (otherCount) addField(article, "Other Files Quantity", otherCount);

    addField(article, "Booking Status", booking.booking_status || booking.status);
    addField(article, "Payment Status", booking.payment_status || "Pending");
    addField(article, "Booking Created", formatDate(booking.created_at));
    addField(article, "Total Amount", formatAmount(booking.amount));
    addField(article, "Verified Payment Received", formatAmount(booking._paidAmount || 0));
    addField(article, "Payment Awaiting Verification", formatAmount(booking._pendingAmount || 0));
    addField(article, "Remaining Balance", formatAmount(booking._remainingAmount ?? booking.amount));
    if (booking.payment_reference) addField(article, "Latest Payment Reference", booking.payment_reference);
    if (booking._payments?.length) {
      const payHistory = makeElement("div", "notice");
      payHistory.appendChild(makeElement("h4", "", "Payment History & UTR"));
      for (const payment of booking._payments) {
        addField(payHistory, "Payment", formatAmount(payment.amount) + " · " + (payment.status || "Pending"));
        addField(payHistory, "UTR / Reference", payment.utr || payment.payment_reference || "दर्ज नहीं");
        addField(payHistory, "Submitted", formatDate(payment.created_at));
        if (payment.verified_at) addField(payHistory, "Verified At", formatDate(payment.verified_at));
        if (payment.verified_by) addField(payHistory, "Verified By", payment.verified_by);
      }
      article.appendChild(payHistory);
    }

    const amountLabel = makeElement("label", "", "Booking Amount (₹)");
    const amountInput = makeElement("input");
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "0.01";
    amountInput.value = booking.amount ?? "";
    amountInput.placeholder = "Amount दर्ज करें";
    amountInput.id = "amount-" + booking.id;
    amountLabel.htmlFor = amountInput.id;

    const amountButton = makeActionButton(
      "Save Amount",
      "btn",
      () => saveAmount(booking.id)
    );

    article.append(amountLabel, amountInput, amountButton);

    const statusLabel = makeElement("label", "", "Booking Status");
    const statusSelect = makeElement("select");
    statusSelect.id = "status-" + booking.id;
    statusLabel.htmlFor = statusSelect.id;

    for (const status of BOOKING_STATUSES) {
      const option = makeElement("option", "", status);
      option.value = status;
      option.selected = status === normalizeStatus(booking.status);
      statusSelect.appendChild(option);
    }

    const statusButton = makeActionButton(
      "Update Status",
      "btn",
      () => saveStatus(booking.id)
    );

    article.append(statusLabel, statusSelect, statusButton);

    article.appendChild(
      makeActionButton(
        "View Customer Files",
        "btn",
        () => viewFiles(booking.id)
      )
    );

    article.appendChild(
      makeActionButton(
        "Delete Booking",
        "btn btn-danger",
        () => deleteBooking(booking)
      )
    );

    const fileOutput = makeElement("div");
    fileOutput.id = "files-" + booking.id;
    fileOutput.style.marginTop = "12px";
    article.appendChild(fileOutput);

    bookingsList.appendChild(article);
  }
}

async function deleteBooking(booking) {
  const bookingNumber = booking.booking_number || booking.id;
  const confirmed = window.confirm(
    "क्या आप Booking " + bookingNumber + " का रिकॉर्ड हटाना चाहते हैं?\n\n" +
    "ध्यान दें: यह केवल bookings टेबल का रिकॉर्ड हटाएगा। " +
    "Payment history, UTR, screenshot और uploaded photos/videos अपने-आप नहीं हटेंगे।\n\n" +
    "यह काम वापस नहीं किया जा सकता। जारी रखें?"
  );
  if (!confirmed) return;

  try {
    await verifyAdmin();

    const { data, error } = await db
      .from("bookings")
      .delete()
      .eq("id", booking.id)
      .select("id, booking_number")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error(
        "Booking delete नहीं हुई। Database में Admin delete policy और permissions जाँचें।"
      );
    }

    currentBookings = currentBookings.filter(
      (item) => String(item.id) !== String(booking.id)
    );
    renderBookings(currentBookings);
    showMessage(
      message,
      "Booking " + (data.booking_number || data.id) +
      " का रिकॉर्ड हट गया। Payment records और uploaded files अलग से मौजूद हो सकते हैं।"
    );
  } catch (error) {
    showMessage(
      message,
      "Booking delete नहीं हुई: " + getErrorText(error),
      true
    );
  }
}

async function saveAmount(bookingId) {
  try {
    await verifyAdmin();

    const raw = $("amount-" + bookingId)?.value.trim();
    if (raw === "" || raw === undefined) {
      throw new Error("Booking Amount दर्ज करें।");
    }

    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("मान्य Amount दर्ज करें।");
    }

    const { data, error } = await db
      .from("bookings")
      .update({ amount })
      .eq("id", bookingId)
      .select("id, amount")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error("Amount अपडेट नहीं हुआ। Permissions जाँचें।");
    }

    showMessage(message, "Booking Amount सेव हो गया।");
    await loadBookings();
  } catch (error) {
    showMessage(
      message,
      "Amount सेव नहीं हुआ: " + getErrorText(error),
      true
    );
  }
}

async function saveStatus(bookingId) {
  try {
    await verifyAdmin();

    const status = $("status-" + bookingId)?.value;
    if (!BOOKING_STATUSES.includes(status)) {
      throw new Error("मान्य Booking Status चुनें।");
    }

    if (!window.confirm("Booking status '" + status + "' करना चाहते हैं?")) {
      return;
    }

    const { data, error } = await db
      .from("bookings")
      .update({ status })
      .eq("id", bookingId)
      .select("id, status")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error("Status अपडेट नहीं हुआ। Permissions जाँचें।");
    }

    showMessage(message, "Status अपडेट हो गया: " + data.status);
    await loadBookings();
  } catch (error) {
    showMessage(
      message,
      "Status अपडेट नहीं हुआ: " + getErrorText(error),
      true
    );
  }
}

/* ---------- CUSTOMER FILES ---------- */

async function viewFiles(bookingId) {
  const output = $("files-" + bookingId);
  if (!output) return;

  output.replaceChildren();
  output.textContent = "Customer files लोड हो रही हैं...";

  try {
    await verifyAdmin();

    const booking = currentBookings.find(
      (item) => String(item.id) === String(bookingId)
    );

    if (!booking) throw new Error("Booking नहीं मिली। Refresh करें।");

    const paths = parseFilePaths(booking.file_paths);

    if (!paths.length) {
      output.textContent = "इस Booking में file_paths उपलब्ध नहीं है।";
      return;
    }

    output.replaceChildren();

    const grid = makeElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit,minmax(220px,1fr))";
    grid.style.gap = "14px";

    for (const item of paths) {
      const path = (
        typeof item === "string"
          ? item
          : item?.path || item?.file_path || item?.storage_path
      )?.trim();

      if (!path) continue;

      const card = makeElement("article", "record");
      const { data, error } = await db.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS);

      if (error || !data?.signedUrl) {
        card.textContent = "File नहीं खुली: " + getErrorText(error);
        grid.appendChild(card);
        continue;
      }

      const url = data.signedUrl;
      const name = typeof item === "object" && item.name
        ? item.name
        : path.split("/").pop() || "Customer File";

      card.appendChild(makeElement("h3", "", name));

      const ext = path.split("?")[0].split(".").pop().toLowerCase();
      const imageExt = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"];
      const videoExt = ["mp4", "webm", "mov", "m4v", "ogv"];

      if (imageExt.includes(ext)) {
        const img = makeElement("img");
        img.src = url;
        img.alt = name;
        img.loading = "lazy";
        img.style.width = "100%";
        img.style.maxHeight = "320px";
        img.style.objectFit = "contain";
        card.appendChild(img);
      } else if (videoExt.includes(ext)) {
        const video = makeElement("video");
        video.src = url;
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.style.width = "100%";
        video.style.maxHeight = "360px";
        card.appendChild(video);
      }

      const link = makeElement("a", "", "Open File");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.display = "inline-block";
      link.style.marginTop = "12px";
      card.appendChild(link);

      grid.appendChild(card);
    }

    output.appendChild(grid);
  } catch (error) {
    output.textContent = "Files नहीं खुलीं: " + getErrorText(error);
  }
}

/* ---------- PAYMENTS ---------- */

async function loadPayments() {
  if (paymentsBusy || !db || adminDashboard?.classList.contains("hidden")) {
    return;
  }

  paymentsBusy = true;
  setButtonBusy(refreshPaymentsButton, true, "Loading...", "Refresh Payments");
  showMessage(paymentMessage, "Payments लोड हो रहे हैं...");

  if (paymentsList) {
    paymentsList.textContent = "कृपया प्रतीक्षा करें...";
  }

  try {
    await verifyAdmin();

    const { data, error } = await db
      .from("payment_submissions")
      .select("id, booking_number, utr, amount, status, created_at, screenshot_path")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const selected = paymentFilter?.value || "all";
    const filtered = (data || []).filter((payment) =>
      selected === "all" ||
      String(payment.status || "pending").toLowerCase() === selected.toLowerCase()
    );

    renderPayments(filtered);
    showMessage(paymentMessage, `${filtered.length} payment records मिले।`);
  } catch (error) {
    if (paymentsList) {
      paymentsList.replaceChildren();
      paymentsList.textContent = "Payments नहीं खुलीं: " + getErrorText(error);
    }

    showMessage(
      paymentMessage,
      "Payments नहीं खुलीं: " + getErrorText(error),
      true
    );
  } finally {
    paymentsBusy = false;
    setButtonBusy(refreshPaymentsButton, false, "", "Refresh Payments");
  }
}

function renderPayments(payments) {
  if (!paymentsList) return;
  paymentsList.replaceChildren();

  if (!payments.length) {
    paymentsList.textContent = "इस filter में कोई payment नहीं है।";
    return;
  }

  for (const payment of payments) {
    const article = makeElement("article", "record");

    article.appendChild(
      makeElement("h3", "", "Booking: " + (payment.booking_number || "उपलब्ध नहीं"))
    );

    const linkedBooking = currentBookings.find((b) => b.booking_number === payment.booking_number);
    addField(article, "Customer Name", linkedBooking?.customer_name || "Booking lookup नहीं मिला");
    addField(article, "Customer Email", linkedBooking?.email || "उपलब्ध नहीं");
    addField(article, "Customer Mobile", linkedBooking?.phone || "उपलब्ध नहीं");
    addField(article, "Customer Address", linkedBooking?.address || "उपलब्ध नहीं");
    addField(article, "Service / Category", linkedBooking?.service || "उपलब्ध नहीं");
    addField(article, "UTR / Transaction Reference", payment.utr || payment.payment_reference || "दर्ज नहीं");
    addField(article, "Submitted Amount", formatAmount(payment.amount));
    addField(article, "Booking Total", formatAmount(linkedBooking?.amount));
    addField(article, "Remaining After Verified Payments", formatAmount(linkedBooking?._remainingAmount ?? linkedBooking?.amount));
    addField(article, "Payment Status", payment.status || "Pending");
    addField(article, "Submitted At", formatDate(payment.created_at));
    if (payment.verified_at) addField(article, "Verified At", formatDate(payment.verified_at));
    if (payment.verified_by) addField(article, "Verified By", payment.verified_by);

    // Screenshots are stored in a private bucket; create a short-lived signed URL.
    if (payment.screenshot_path) {
      const screenshotBox = makeElement("div", "payment-screenshot");
      screenshotBox.appendChild(makeElement("h4", "", "Customer Payment Screenshot"));
      const preview = makeElement("img");
      preview.alt = "Payment screenshot for booking " + (payment.booking_number || "");
      preview.loading = "lazy";
      preview.style.display = "block";
      preview.style.width = "100%";
      preview.style.maxWidth = "520px";
      preview.style.maxHeight = "520px";
      preview.style.objectFit = "contain";
      preview.style.background = "#fff";
      preview.style.borderRadius = "10px";
      preview.style.margin = "10px 0";
      preview.alt = "Screenshot loading...";
      screenshotBox.appendChild(preview);

      const link = makeElement("a", "btn btn-secondary", "Open Full Screenshot");
      link.href = "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.display = "inline-block";
      link.style.margin = "8px 0 12px";
      link.textContent = "Open Full Screenshot";
      screenshotBox.appendChild(link);

      const loadScreenshot = async () => {
        const { data: signed, error: signedError } = await db.storage
          .from("payment-screenshots")
          .createSignedUrl(payment.screenshot_path, 3600);
        if (signedError || !signed?.signedUrl) {
          preview.alt = "Screenshot नहीं खुला: " + getErrorText(signedError);
          preview.style.display = "none";
          link.textContent = "Screenshot खोलने में समस्या";
          link.removeAttribute("href");
          return;
        }
        preview.alt = "Payment screenshot";
        preview.src = signed.signedUrl;
        link.href = signed.signedUrl;
      };
      loadScreenshot().catch((error) => {
        preview.alt = "Screenshot नहीं खुला: " + getErrorText(error);
        preview.style.display = "none";
      });
      article.appendChild(screenshotBox);
    } else {
      addField(article, "Screenshot", "इस payment record में screenshot_path खाली है।");
    }

    article.appendChild(
      makeActionButton("Mark Paid", "btn", () =>
        reviewPayment(payment.id, "Paid")
      )
    );

    article.appendChild(
      makeActionButton("Reject", "btn btn-danger", () =>
        reviewPayment(payment.id, "Rejected")
      )
    );

    article.appendChild(
      makeActionButton("Delete Payment Record", "btn btn-danger", () =>
        deletePaymentRecord(payment)
      )
    );

    paymentsList.appendChild(article);
  }
}

async function deletePaymentRecord(payment) {
  const confirmed = window.confirm(
    "क्या आप Booking " + (payment.booking_number || "उपलब्ध नहीं") +
    " का यह Payment Verification रिकॉर्ड हटाना चाहते हैं?\\n\\n" +
    "यह payment_submissions से रिकॉर्ड हटाएगा। Screenshot Storage में अलग से रह सकता है।\\n" +
    "यह काम वापस नहीं किया जा सकता।"
  );
  if (!confirmed) return;

  try {
    await verifyAdmin();
    const { data, error } = await db
      .from("payment_submissions")
      .delete()
      .eq("id", payment.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error("रिकॉर्ड नहीं हटा। Supabase में admin-only delete policy जाँचें।");
    }

    await loadPayments();
    await loadBookings();
    showMessage(paymentMessage, "Payment Verification रिकॉर्ड हटा दिया गया। Screenshot फ़ाइल अलग से रह सकती है।");
  } catch (error) {
    showMessage(paymentMessage, "Payment रिकॉर्ड डिलीट नहीं हुआ: " + getErrorText(error), true);
  }
}

async function reviewPayment(paymentId, nextStatus) {
  if (!["Paid", "Rejected"].includes(nextStatus)) return;

  const confirmed = window.confirm(
    nextStatus === "Paid"
      ? "भुगतान को वास्तविक बैंक/UPI रिकॉर्ड से सत्यापित किया है?"
      : "क्या आप इस payment को Reject करना चाहते हैं?"
  );

  if (!confirmed) return;

  try {
    await verifyAdmin();

    const { data, error } = await db
      .from("payment_submissions")
       .update({ status: nextStatus, verified_at: new Date().toISOString(), verified_by: (await verifyAdmin()).email || "Admin" })
      .eq("id", paymentId)
      .select("id, booking_number, status")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Payment अपडेट नहीं हुई। Permissions जाँचें।");
    const bookingPaymentStatus = nextStatus === "Paid" ? "Paid" : "Rejected";
    const { error: bookingUpdateError } = await db.from("bookings").update({ payment_status: bookingPaymentStatus }).eq("booking_number", data.booking_number);
    if (bookingUpdateError) throw new Error("Payment submission अपडेट हुई, लेकिन booking status अपडेट नहीं हुआ: " + getErrorText(bookingUpdateError));
    showMessage(paymentMessage, "Payment status अपडेट हो गया: " + nextStatus);
    await Promise.all([loadPayments(), loadBookings()]);
  } catch (error) {
    showMessage(
      paymentMessage,
      "Payment update नहीं हुई: " + getErrorText(error),
      true
    );
  }
}

/* ---------- SERVICE GALLERY ---------- */

function detectMediaType(file) {
  if (file?.type?.startsWith("image/")) return "image";
  if (file?.type?.startsWith("video/")) return "video";
  return null;
}

function validateGalleryFile(file) {
  if (!file) throw new Error("Photo या Video चुनें।");

  const type = detectMediaType(file);
  if (!type) {
    throw new Error("केवल मान्य Image या Video फ़ाइल अपलोड करें।");
  }

  const maxSize = type === "image"
    ? 10 * 1024 * 1024
    : 50 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      type === "image"
        ? "Photo अधिकतम 10 MB की हो सकती है।"
        : "Video अधिकतम 50 MB की हो सकती है।"
    );
  }

  return type;
}

async function uploadServiceGallery(event) {
  event.preventDefault();

  if (galleryBusy || !db) return;
  galleryBusy = true;

  setButtonBusy(
    galleryUploadButton,
    true,
    "Uploading...",
    "Upload Photo / Video"
  );

  try {
    await verifyAdmin();

    const title = galleryTitle?.value.trim();
    const service = galleryService?.value;
    const file = galleryFile?.files?.[0];

    if (!title) throw new Error("Photo / Video Title लिखें।");
    if (!GALLERY_SERVICES.includes(service)) {
      throw new Error("Service चुनें।");
    }

    const mediaType = validateGalleryFile(file);
    showMessage(galleryMessage, "फ़ाइल अपलोड हो रही है...");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath =
      service.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
      "/" + Date.now() + "-" + crypto.randomUUID() + "-" + safeName;

    const { error: uploadError } = await db.storage
      .from(GALLERY_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const { error: insertError } = await db
      .from(GALLERY_TABLE)
      .insert({
        title,
        service,
        media_type: mediaType,
        file_path: filePath,
        is_active: true
      });

    if (insertError) {
      // DB row failed; try to clean up the uploaded object.
      await db.storage.from(GALLERY_BUCKET).remove([filePath]);
      throw insertError;
    }

    galleryUploadForm?.reset();
    showMessage(galleryMessage, "Photo / Video सफलतापूर्वक अपलोड हो गया।");
    await loadServiceGallery();
  } catch (error) {
    showMessage(
      galleryMessage,
      "Gallery upload नहीं हुआ: " + getErrorText(error),
      true
    );
  } finally {
    galleryBusy = false;
    setButtonBusy(
      galleryUploadButton,
      false,
      "",
      "Upload Photo / Video"
    );
  }
}

async function loadServiceGallery() {
  if (!db || !galleryAdminList ||
      adminDashboard?.classList.contains("hidden")) {
    return;
  }

  setButtonBusy(refreshGalleryButton, true, "Loading...", "Refresh Gallery");
  galleryAdminList.textContent = "Gallery लोड हो रही है...";

  try {
    await verifyAdmin();

    const { data, error } = await db
      .from(GALLERY_TABLE)
      .select("id, title, service, media_type, file_path, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    galleryAdminList.replaceChildren();

    if (!data?.length) {
      galleryAdminList.textContent = "अभी कोई Gallery item नहीं है।";
      return;
    }

    for (const item of data) {
      const card = makeElement("article", "record");
      card.appendChild(makeElement("h3", "", item.title));
      addField(card, "Service", item.service);
      addField(card, "Type", item.media_type);
      addField(card, "Status", item.is_active ? "Visible" : "Hidden");
      addField(card, "Uploaded", formatDate(item.created_at));

      const { data: publicData } = db.storage
        .from(GALLERY_BUCKET)
        .getPublicUrl(item.file_path);

      const url = publicData?.publicUrl;

      if (url && item.media_type === "image") {
        const img = makeElement("img");
        img.src = url;
        img.alt = item.title;
        img.loading = "lazy";
        img.style.width = "100%";
        img.style.maxHeight = "280px";
        img.style.objectFit = "contain";
        card.appendChild(img);
      } else if (url && item.media_type === "video") {
        const video = makeElement("video");
        video.src = url;
        video.controls = true;
        video.preload = "metadata";
        video.style.width = "100%";
        video.style.maxHeight = "320px";
        card.appendChild(video);
      }

      card.appendChild(
        makeActionButton(
          item.is_active ? "Hide from Website" : "Show on Website",
          "btn btn-secondary",
          () => toggleGalleryItem(item.id, !item.is_active)
        )
      );

      card.appendChild(
        makeActionButton(
          "Delete Item",
          "btn btn-danger",
          () => deleteGalleryItem(item)
        )
      );

      galleryAdminList.appendChild(card);
    }
  } catch (error) {
    galleryAdminList.textContent =
      "Gallery नहीं खुली: " + getErrorText(error);

    showMessage(
      galleryMessage,
      "Gallery नहीं खुली: " + getErrorText(error),
      true
    );
  } finally {
    setButtonBusy(refreshGalleryButton, false, "", "Refresh Gallery");
  }
}

async function toggleGalleryItem(id, isActive) {
  try {
    await verifyAdmin();

    const { data, error } = await db
      .from(GALLERY_TABLE)
      .update({ is_active: isActive })
      .eq("id", id)
      .select("id, is_active")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Gallery status अपडेट नहीं हुआ।");

    showMessage(
      galleryMessage,
      isActive ? "Gallery item वेबसाइट पर दिखेगा।" : "Gallery item छिपा दिया गया।"
    );

    await loadServiceGallery();
  } catch (error) {
    showMessage(
      galleryMessage,
      "Gallery status नहीं बदला: " + getErrorText(error),
      true
    );
  }
}

async function deleteGalleryItem(item) {
  if (!window.confirm(
    "क्या आप इस Gallery item को हमेशा के लिए हटाना चाहते हैं?"
  )) return;

  try {
    await verifyAdmin();

    const { error: rowError } = await db
      .from(GALLERY_TABLE)
      .delete()
      .eq("id", item.id);

    if (rowError) throw rowError;

    const { error: fileError } = await db.storage
      .from(GALLERY_BUCKET)
      .remove([item.file_path]);

    if (fileError) {
      showMessage(
        galleryMessage,
        "Database से item हट गया, लेकिन Storage file नहीं हटी: " +
          getErrorText(fileError),
        true
      );
    } else {
      showMessage(galleryMessage, "Gallery item हटा दिया गया।");
    }

    await loadServiceGallery();
  } catch (error) {
    showMessage(
      galleryMessage,
      "Gallery item नहीं हटा: " + getErrorText(error),
      true
    );
  }
}

/* ---------- EVENT LISTENERS ---------- */

if (loginForm) {
  loginForm.addEventListener("submit", handleLogin);
}

if (logoutButton) {
  logoutButton.addEventListener("click", handleLogout);
}

if (refreshButton) {
  refreshButton.addEventListener("click", loadBookings);
}

if (refreshPaymentsButton) {
  refreshPaymentsButton.addEventListener("click", loadPayments);
}

if (paymentFilter) {
  paymentFilter.addEventListener("change", loadPayments);
}

if (galleryUploadForm) {
  galleryUploadForm.addEventListener("submit", uploadServiceGallery);
}

if (refreshGalleryButton) {
  refreshGalleryButton.addEventListener("click", loadServiceGallery);
}

/* ---------- AUTH STATE ---------- */

if (db) {
  db.auth.onAuthStateChange((event, session) => {
    // Auth callback में भारी async queries सीधे न चलाएँ।
    if (event === "SIGNED_OUT" || !session) {
      showLogin();
    }
  });
}

/* ---------- START ---------- */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAdmin, {
    once: true
  });
} else {
  initializeAdmin();
}
