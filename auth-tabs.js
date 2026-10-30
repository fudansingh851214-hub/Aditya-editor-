(function () {
  "use strict";

  // This file owns the customer auth form. It is intentionally independent
  // from the large dashboard script so a secondary dashboard script error
  // cannot make Login / Create Account stop responding.
  var mode = "login";
  var busy = false;
  var client = null;
  var supabaseUrl = "https://okzwtylpmcyurkxvaocy.supabase.co";
  var publishableKey = "sb_publishable_PjYL34jyFif4E6eHc7HYJQ_y-5SAs0q";
  var redirectUrl = "https://aditya-editor.vercel.app/auth.html";

  function byId(id) { return document.getElementById(id); }
  function showMessage(text, kind) {
    var el = byId("message");
    if (!el) return;
    el.textContent = text || "";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.style.display = text ? "block" : "none";
    el.style.color = kind === "success" ? "#176347" : "#9a3412";
    el.style.background = kind === "success" ? "#effaf2" : "#fff7ed";
    el.style.borderColor = kind === "success" ? "#b8dfc3" : "#fed7aa";
  }

  function getClient() {
    if (client) return client;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Login service अभी लोड नहीं हुई। Internet जाँचकर पेज refresh करें।");
    }
    client = window.supabase.createClient(supabaseUrl, publishableKey, {
      auth: {
        storageKey: "edit-concept-customer-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  function setMode(next) {
    mode = next === "signup" ? "signup" : next === "reset" ? "reset" : "login";
    var signup = mode === "signup";
    var reset = mode === "reset";
    ["signupFields", "confirmPasswordField"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.hidden = !signup;
      el.style.setProperty("display", signup ? "block" : "none", "important");
    });
    var loginTab = byId("loginTab");
    var signupTab = byId("signupTab");
    if (loginTab) {
      loginTab.classList.toggle("active", mode === "login");
      loginTab.setAttribute("aria-pressed", String(mode === "login"));
    }
    if (signupTab) {
      signupTab.classList.toggle("active", signup);
      signupTab.setAttribute("aria-pressed", String(signup));
    }
    if (byId("submitButton")) {
      byId("submitButton").textContent = signup ? "Create Account" : reset ? "Set New Password" : "Login";
    }
    var password = byId("password");
    if (password) {
      password.minLength = signup || reset ? 8 : 0;
      password.autocomplete = signup || reset ? "new-password" : "current-password";
      password.placeholder = reset ? "नया password (कम से कम 8 characters)" : signup ? "Enter your password (at least 8 characters)" : "Enter your password";
    }
    ["fullName", "mobileNumber", "confirmPassword"].forEach(function (id) {
      var el = byId(id);
      if (el) el.required = signup;
    });
    var forgot = byId("forgotArea");
    if (forgot) forgot.style.display = mode === "login" ? "block" : "none";
    showMessage("");
  }
  window.switchAuthMode = setMode;
  window.__editConceptAuthMode = mode;

  function renderHeader(user) {
    var name = byId("siteAccountName");
    var signed = byId("siteAccountSigned");
    var logout = byId("siteAccountLogout");
    if (user) {
      var label = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
        (user.email ? user.email.split("@")[0] : "My Account");
      if (name) name.textContent = label;
      if (signed) signed.textContent = "Signed in as " + label;
      if (logout) logout.hidden = false;
    } else {
      if (name) name.textContent = "Sign In / Create Account";
      if (signed) signed.textContent = "Guest — Sign in to manage bookings";
      if (logout) logout.hidden = true;
    }
  }

  function showDashboard(user) {
    var authArea = byId("authArea");
    var dashboard = byId("dashboard");
    if (authArea) authArea.style.setProperty("display", "none", "important");
    if (dashboard) dashboard.style.setProperty("display", "block", "important");
    var meta = user.user_metadata || {};
    var fullName = meta.full_name || meta.name || (user.email ? user.email.split("@")[0] : "Customer");
    var mobile = meta.phone || meta.mobile || user.phone || "अभी दर्ज नहीं";
    var values = {
      welcome: "Customer Dashboard",
      signedInName: fullName,
      signedInEmail: user.email || "",
      profileFullName: fullName,
      profileEmail: user.email || "",
      profileMobile: mobile,
      profileStatus: user.email_confirmed_at ? "Active · Email verified" : "Active · Email verification pending",
      customerEmail: user.email || ""
    };
    Object.keys(values).forEach(function (id) {
      var el = byId(id);
      if (el) el.textContent = values[id];
    });
    renderHeader(user);
    loadBookings(user);
    var bookingsSection = document.querySelector(".history-section");
    if (bookingsSection) bookingsSection.scrollIntoView({ behavior: "auto", block: "start" });
    else if (dashboard) dashboard.scrollIntoView({ behavior: "auto", block: "start" });
  }

  async function loadBookings(user) {
    var box = byId("bookingHistory");
    if (!box) return;
    box.textContent = "आपकी बुकिंग लोड हो रही हैं...";
    try {
      var db = getClient();
      var result = await db.from("bookings")
        .select("booking_number,service,booking_status,status,amount,created_at,phone")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      var rows = result.data || [];
      box.textContent = "";
      if (!rows.length) {
        box.textContent = "इस account से अभी कोई बुकिंग नहीं मिली। नई बुकिंग के लिए Book New Service दबाएँ।";
        return;
      }
      rows.forEach(function (booking) {
        var card = document.createElement("article");
        card.className = "history-card";
        var heading = document.createElement("h4");
        heading.textContent = booking.booking_number || "Booking";
        card.appendChild(heading);
        [
          "Service: " + (booking.service || "—"),
          "Mobile: " + (booking.phone || "—"),
          "Status: " + (booking.booking_status || booking.status || "Submitted"),
          "Amount: " + (booking.amount == null ? "Admin confirmation pending" : "₹" + Number(booking.amount).toLocaleString("en-IN"))
        ].forEach(function (line) {
          var p = document.createElement("p");
          p.textContent = line;
          card.appendChild(p);
        });
        var link = document.createElement("a");
        link.className = "action";
        link.textContent = "Track Booking";
        var camera = /camera/i.test(booking.service || "");
        link.href = (camera ? "camera-tracking.html" : "tracking.html") + "?id=" + encodeURIComponent(booking.booking_number || "");
        card.appendChild(link);
        box.appendChild(card);
      });
      var count = byId("invoiceBookingCount");
      if (count) count.textContent = String(rows.length);
      var pending = byId("invoicePendingCount");
      if (pending) pending.textContent = String(rows.filter(function (r) { return /pending|submitted|review|confirm/i.test(r.booking_status || r.status || "pending"); }).length);
      var total = byId("invoiceTotalAmount");
      if (total) {
        var priced = rows.filter(function (r) { return r.amount != null && Number.isFinite(Number(r.amount)); });
        total.textContent = priced.length ? "₹" + priced.reduce(function (sum, r) { return sum + Math.max(0, Number(r.amount) || 0); }, 0).toLocaleString("en-IN") : "Admin confirmation pending";
      }
    } catch (error) {
      box.textContent = "Login सफल है, लेकिन बुकिंग लोड नहीं हो सकीं। कृपया बाद में Refresh करें। (" + (error.message || "Database error") + ")";
    }
  }

  async function submitAuth(event) {
    if (!event.target || event.target.id !== "authForm") return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (busy) return;

    var email = byId("email");
    var password = byId("password");
    var button = byId("submitButton");
    var emailValue = email ? email.value.trim().toLowerCase() : "";
    var passwordValue = password ? password.value : "";

    try {
      if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) throw new Error("कृपया सही Email Address भरें।");
      if (!passwordValue) throw new Error("कृपया Password भरें।");
      if ((mode === "signup" || mode === "reset") && passwordValue.length < 8) throw new Error("Password कम से कम 8 characters का होना चाहिए।");
      if (mode === "signup") {
        var fullName = byId("fullName").value.trim();
        var mobile = byId("mobileNumber").value.trim();
        var confirm = byId("confirmPassword").value;
        if (fullName.length < 2) throw new Error("अपना पूरा नाम भरें।");
        if (!/^[6-9][0-9]{9}$/.test(mobile)) throw new Error("सही 10-digit Indian mobile number भरें।");
        if (passwordValue !== confirm) throw new Error("Password और Confirm Password एक जैसे नहीं हैं।");
      }

      busy = true;
      if (button) { button.disabled = true; button.textContent = mode === "signup" ? "Creating Account..." : mode === "reset" ? "Saving Password..." : "Logging in..."; }
      showMessage(mode === "signup" ? "आपका Customer Account बनाया जा रहा है..." : mode === "reset" ? "नया password सेव हो रहा है..." : "Login हो रहा है...");
      var db = getClient();

      if (mode === "signup") {
        var created = await db.auth.signUp({
          email: emailValue,
          password: passwordValue,
          options: {
            data: { full_name: byId("fullName").value.trim(), phone: byId("mobileNumber").value.trim() },
            emailRedirectTo: redirectUrl
          }
        });
        if (created.error) throw created.error;
        if (created.data && created.data.session && created.data.user) {
          showDashboard(created.data.user);
          showMessage("आपका Account सफलतापूर्वक बन गया है।", "success");
        } else {
          setMode("login");
          if (email) email.value = emailValue;
          showMessage("Account बनाने का अनुरोध सफल है। अपने Email के Inbox/Spam में confirmation link खोलें। Email verify होने के बाद Login करें।", "success");
        }
      } else if (mode === "reset") {
        var changed = await db.auth.updateUser({ password: passwordValue });
        if (changed.error) throw changed.error;
        setMode("login");
        if (password) password.value = "";
        showMessage("नया password सफलतापूर्वक सेव हो गया। अब नए password से Login करें।", "success");
      } else {
        var loggedIn = await db.auth.signInWithPassword({ email: emailValue, password: passwordValue });
        if (loggedIn.error) throw loggedIn.error;
        if (!loggedIn.data || !loggedIn.data.user) throw new Error("Login पूरा नहीं हुआ। कृपया फिर कोशिश करें।");
        showDashboard(loggedIn.data.user);
        showMessage("");
      }
    } catch (error) {
      var raw = String(error && error.message || "");
      var friendly = raw || "कृपया दोबारा कोशिश करें।";
      if (/invalid login credentials/i.test(raw)) friendly = "Email या Password सही नहीं है। कृपया दोनों जाँचें।";
      else if (/email not confirmed/i.test(raw)) friendly = "आपका Email verify नहीं हुआ है। Inbox/Spam में confirmation email खोलकर Verify करें, फिर Login करें।";
      else if (/user already registered/i.test(raw)) friendly = "इस Email से account पहले से बना है। Create Account के बजाय Login करें या Forgot Password इस्तेमाल करें।";
      else if (/rate limit|email rate limit/i.test(raw)) friendly = "बहुत जल्दी कई बार कोशिश हुई है। कुछ समय बाद फिर कोशिश करें।";
      else if (/fetch failed|failed to fetch|networkerror|load failed/i.test(raw)) friendly = "Internet या server connection में समस्या है। Internet जाँचकर फिर कोशिश करें।";
      else if (/redirect.*not allowed|invalid.*redirect/i.test(raw)) friendly = "Email confirmation redirect URL Supabase में allow नहीं है।";
      showMessage("समस्या: " + friendly);
    } finally {
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = mode === "signup" ? "Create Account" : mode === "reset" ? "Set New Password" : "Login";
      }
    }
  }

  function bind() {
    var loginTab = byId("loginTab");
    var signupTab = byId("signupTab");
    var form = byId("authForm");
    var forgot = byId("forgotLink");
    var logout = byId("logoutButton");
    var headerLogout = byId("siteAccountLogout");
    var trigger = byId("siteAccountTrigger");
    var menu = byId("siteAccountMenu");
    var menuButton = byId("siteMenuButton");
    var nav = byId("siteLinks");

    if (loginTab) loginTab.addEventListener("click", function (e) { e.preventDefault(); setMode("login"); });
    if (signupTab) signupTab.addEventListener("click", function (e) { e.preventDefault(); setMode("signup"); });
    if (form) form.addEventListener("submit", submitAuth, true);

    if (forgot) forgot.addEventListener("click", async function (e) {
      e.preventDefault();
      var address = byId("email").value.trim().toLowerCase();
      if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        showMessage("पहले सही Email Address भरें, फिर Forgot Password दबाएँ।");
        byId("email").focus();
        return;
      }
      try {
        showMessage("Password reset email भेज रहे हैं...");
        var response = await getClient().auth.resetPasswordForEmail(address, { redirectTo: redirectUrl });
        if (response.error) throw response.error;
        showMessage("यदि इस Email से account मौजूद है, तो reset link भेज दिया गया है। Inbox/Spam जाँचें।", "success");
      } catch (error) { showMessage("Reset email नहीं भेजा जा सका: " + (error.message || "दोबारा कोशिश करें।")); }
    });

    if (logout) logout.addEventListener("click", async function () {
      try { var result = await getClient().auth.signOut(); if (result.error) throw result.error; }
      catch (error) { showMessage("Logout नहीं हुआ: " + (error.message || "दोबारा कोशिश करें।")); return; }
      if (byId("dashboard")) byId("dashboard").style.setProperty("display", "none", "important");
      if (byId("authArea")) byId("authArea").style.setProperty("display", "block", "important");
      renderHeader(null);
      setMode("login");
      showMessage("आप सफलतापूर्वक Logout हो गए हैं।", "success");
    });
    if (headerLogout) headerLogout.addEventListener("click", async function () {
      try { await getClient().auth.signOut(); } catch (_) {}
      if (menu) menu.classList.remove("open");
      renderHeader(null);
    });
    if (trigger && menu) trigger.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(open));
    });
    if (menuButton && nav) menuButton.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(open));
    });

    try {
      var db = getClient();
      db.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset");
          if (byId("authArea")) byId("authArea").style.setProperty("display", "block", "important");
          if (byId("dashboard")) byId("dashboard").style.setProperty("display", "none", "important");
          showMessage("नया password बनाएँ। कम से कम 8 characters रखें।", "success");
        } else if (event === "SIGNED_OUT") {
          renderHeader(null);
        }
      });
      db.auth.getSession().then(function (result) {
        if (result.error) { showMessage("Session जाँचने में समस्या: " + result.error.message); return; }
        if (result.data && result.data.session && result.data.session.user) showDashboard(result.data.session.user);
        else renderHeader(null);
      }).catch(function (error) { showMessage("Session जाँचने में समस्या: " + (error.message || "Refresh करें।")); });
    } catch (error) {
      showMessage(error.message || "Login service शुरू नहीं हुई।");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();