(function () {
  "use strict";
  var mode = "login";
  var busy = false;

  function message(text) {
    var el = document.getElementById("message");
    if (el) el.textContent = text;
  }

  window.switchAuthMode = function (next) {
    mode = next === "signup" ? "signup" : "login";
    window.__editConceptAuthMode = mode;
    var signup = mode === "signup";
    ["signupFields", "confirmPasswordField"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.hidden = !signup;
        el.style.setProperty("display", signup ? "block" : "none", "important");
      }
    });
    var login = document.getElementById("loginTab");
    var create = document.getElementById("signupTab");
    if (login && create) {
      login.classList.toggle("active", !signup);
      create.classList.toggle("active", signup);
      login.setAttribute("aria-pressed", String(!signup));
      create.setAttribute("aria-pressed", String(signup));
    }
    var submit = document.getElementById("submitButton");
    if (submit) submit.textContent = signup ? "Create Account" : "Login";
    ["fullName", "mobileNumber", "confirmPassword"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.required = signup;
    });
    var password = document.getElementById("password");
    if (password) {
      password.minLength = signup ? 8 : 0;
      password.autocomplete = signup ? "new-password" : "current-password";
    }
    var forgot = document.getElementById("forgotArea");
    if (forgot) forgot.style.display = signup ? "none" : "block";
    message("");
    try {
      if (typeof window.setMode === "function") window.setMode(mode);
    } catch (e) {
      // The independent signup handler below remains available.
    }
  };

  // Independent signup submit handler: works even if another page script fails.
  document.addEventListener("submit", async function (event) {
    if (!event.target || event.target.id !== "authForm" || mode !== "signup") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;

    var button = document.getElementById("submitButton");
    var email = document.getElementById("email");
    var password = document.getElementById("password");
    var fullName = document.getElementById("fullName");
    var mobile = document.getElementById("mobileNumber");
    var confirm = document.getElementById("confirmPassword");
    var supabaseLib = window.supabase;

    try {
      var nameValue = fullName.value.trim();
      var mobileValue = mobile.value.trim();
      var emailValue = email.value.trim().toLowerCase();
      if (nameValue.length < 2) throw new Error("अपना पूरा नाम सही से भरें।");
      if (!/^[6-9][0-9]{9}$/.test(mobileValue)) throw new Error("सही 10-digit Indian mobile number भरें।");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) throw new Error("सही Email Address भरें।");
      if (password.value.length < 8) throw new Error("Password कम से कम 8 characters का होना चाहिए।");
      if (password.value !== confirm.value) throw new Error("Password और Confirm Password एक जैसे नहीं हैं।");
      if (!supabaseLib || !supabaseLib.createClient) throw new Error("Supabase library लोड नहीं हुई। Internet चालू करके पेज refresh करें।");

      busy = true;
      if (button) { button.disabled = true; button.textContent = "Creating Account..."; }
      message("आपका Customer Account बनाया जा रहा है...");

      var client = supabaseLib.createClient(
        "https://okzwtylpmcyurkxvaocy.supabase.co",
        "sb_publishable_PjYL34jyFif4E6eHc7HYJQ_y-5SAs0q",
        { auth: { storageKey: "edit-concept-customer-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      );
      var result = await client.auth.signUp({
        email: emailValue,
        password: password.value,
        options: {
          data: { full_name: nameValue, phone: mobileValue },
          emailRedirectTo: "https://aditya-editor.vercel.app/auth.html"
        }
      });
      if (result.error) throw result.error;

      if (result.data && result.data.session) {
        message("आपका Account सफलतापूर्वक बन गया! Dashboard खोल रहे हैं...");
        window.location.reload();
      } else {
        message("Account सफलतापूर्वक बन गया। अपने Email के Inbox/Spam में confirmation link खोलें। Email verify होने के बाद Login करें।");
        event.target.reset();
        window.switchAuthMode("login");
      }
    } catch (error) {
      var raw = String(error && error.message || "");
      var friendly = raw || "Account नहीं बन पाया। कृपया दोबारा कोशिश करें।";
      if (/user already registered|already been registered/i.test(raw)) friendly = "इस Email से Account पहले से बना हुआ है। Login करें या Forgot Password इस्तेमाल करें।";
      else if (/password.*(weak|at least)|weak password/i.test(raw)) friendly = "Password मजबूत रखें और कम से कम 8 characters डालें।";
      else if (/rate limit|email rate limit/i.test(raw)) friendly = "बहुत जल्दी कई बार कोशिश हुई है। कुछ समय बाद फिर कोशिश करें।";
      else if (/redirect.*not allowed|invalid.*redirect/i.test(raw)) friendly = "Email confirmation URL Supabase में allow नहीं है। Admin को Auth URL Configuration में aditya-editor.vercel.app/auth.html जोड़ना होगा।";
      message("समस्या: " + friendly);
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = "Create Account"; }
    }
  }, true);

  window.__editConceptAuthMode = mode;
  window.addEventListener("DOMContentLoaded", function () {
    var login = document.getElementById("loginTab");
    var create = document.getElementById("signupTab");
    if (login) login.addEventListener("click", function (e) { e.preventDefault(); window.switchAuthMode("login"); });
    if (create) create.addEventListener("click", function (e) { e.preventDefault(); window.switchAuthMode("signup"); });
  });
})();