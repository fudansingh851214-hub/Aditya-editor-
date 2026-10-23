
/* ============================================
   ADITYA EDITOR — UPDATED COMPLETE SCRIPT
   Navigation | File Upload | Booking
   Supabase Storage | Tracking | Confirmation
============================================ */

/* ---------- SUPABASE CONFIG ---------- */

const SUPABASE_URL =
  "https://okzwtylpmcyurkxvaocy.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_PjYL34jyFif4E6eHc7HYJQ_y-5SAs0q";

const STORAGE_BUCKET = "customer-media";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const UPLOAD_BATCH_SIZE = 5;

const supabaseClient =
  window.supabase
    ? window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      )
    : null;

if (!supabaseClient) {
  console.error("Supabase library load nahi hui.");
}

/* ---------- NAVIGATION ---------- */

const nav = document.getElementById("nav");
const menuToggle = document.getElementById("menuToggle");

if (nav && menuToggle) {
  menuToggle.addEventListener("click", () => {
    const isOpen = !nav.classList.contains("active");

    nav.classList.toggle("active", isOpen);
    nav.classList.toggle("open", isOpen);

    menuToggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("active", "open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

/* ---------- FOOTER YEAR ---------- */

const yearElement = document.getElementById("year");

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

/* ---------- FILE SELECTION ---------- */

const mediaInput = document.getElementById("mediaFiles");
const selectedFilesDisplay =
  document.getElementById("selectedFiles");

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  }

  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function updateSelectedFiles() {
  const files = Array.from(mediaInput?.files || []);

  if (selectedFilesDisplay) {
    if (!files.length) {
      selectedFilesDisplay.textContent = "No files selected";
    } else {
      const totalSize = files.reduce(
        (sum, file) => sum + file.size,
        0
      );

      selectedFilesDisplay.textContent =
        `${files.length} photo/video file(s) selected\n` +
        `Total size: ${formatFileSize(totalSize)}`;
    }
  }

  const countElement = document.getElementById("fileCount");

  if (countElement) {
    countElement.textContent = files.length
      ? `${files.length} file(s) selected`
      : "No files selected";
  }
}

if (mediaInput) {
  mediaInput.multiple = true;
  mediaInput.accept = "image/*,video/*";
  mediaInput.addEventListener("change", updateSelectedFiles);
}

/* ---------- HELPER FUNCTIONS ---------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function createBookingNumber() {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  const random = Math.floor(
    10000 + Math.random() * 90000
  );

  return `AE-${date}-${random}`;
}

function showDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString("en-IN");
}

function showMessage(element, text, isError = false) {
  if (!element) return;

  element.textContent = text;
  element.style.color = isError ? "#c62828" : "";
}

/* ---------- BOOKING FORM ---------- */

const bookingForm = document.getElementById("bookingForm");

if (bookingForm) {
  bookingForm.addEventListener("submit", async event => {
    event.preventDefault();

    const message =
      document.getElementById("bookingMessage");

    const submitButton = bookingForm.querySelector(
      'button[type="submit"]'
    );

    if (!message || !submitButton) return;

    if (!supabaseClient) {
      showMessage(
        message,
        "Supabase load nahi hua. Internet aur CDN check karein.",
        true
      );
      return;
    }

    const formData = new FormData(bookingForm);

    const name = String(formData.get("name") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const service = String(formData.get("service") || "").trim();

    const files = Array.from(mediaInput?.files || []);

    if (!name || !phone || !service) {
      showMessage(
        message,
        "Name, phone aur service fill karein.",
        true
      );
      return;
    }

    if (files.length > 5) {
      showMessage(
        message,
        "Adhiktam 5 files upload kar sakte hain.",
        true
      );
      return;
    }

    for (const file of files) {
      const allowed =
        file.type.startsWith("image/") ||
        file.type.startsWith("video/");

      if (!allowed) {
        showMessage(
          message,
          `${file.name}: sirf photo aur video allowed hain.`,
          true
        );
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        showMessage(
          message,
          `${file.name}: file 50 MB se chhoti honi chahiye.`,
          true
        );
        return;
      }
    }

    const bookingNumber = createBookingNumber();
    const uploadedPaths = [];

    submitButton.disabled = true;
    submitButton.textContent = "PLEASE WAIT";

    if (mediaInput) mediaInput.disabled = true;

    try {
      showMessage(message, "Booking prepare ho rahi hai...");

      /* Upload files */

      for (
        let batchStart = 0;
        batchStart < files.length;
        batchStart += UPLOAD_BATCH_SIZE
      ) {
        const batchEnd = Math.min(
          batchStart + UPLOAD_BATCH_SIZE,
          files.length
        );

        for (let i = batchStart; i < batchEnd; i++) {
          const file = files[i];

          showMessage(
            message,
            `Uploading ${i + 1}/${files.length}: ${file.name}`
          );

          const safeName = file.name.replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
          );

          const uniquePart =
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()
                  .toString(36)
                  .slice(2)}`;

          const filePath =
            `${bookingNumber}/${uniquePart}-${safeName}`;

          const { error: uploadError } =
            await supabaseClient
              .storage
              .from(STORAGE_BUCKET)
              .upload(filePath, file, {
                upsert: false,
                contentType:
                  file.type || "application/octet-stream"
              });

          if (uploadError) {
            throw new Error(
              `Upload failed: ${uploadError.message}`
            );
          }

          uploadedPaths.push(filePath);
        }
      }

      /* Save booking in database */

      showMessage(message, "Booking save ho rahi hai...");

      const { error: insertError } =
        await supabaseClient
          .from("bookings")
          .insert({
            booking_number: bookingNumber,
            customer_name: name,
            phone: phone,
            service: service,
            status: "Submitted",
            file_paths: uploadedPaths
          });

      if (insertError) {
        throw insertError;
      }

      /* Store booking number */

      try {
        sessionStorage.setItem(
          "adityaLastBookingId",
          bookingNumber
        );
      } catch (storageError) {
        console.warn("Session storage unavailable.");
      }

      showMessage(
        message,
        "Booking successful! Confirmation khul raha hai..."
      );

      /* Open confirmation with real booking number */

      const confirmationURL = new URL(
        "confirmation.html",
        window.location.href
      );

      confirmationURL.searchParams.set("id", bookingNumber);

      window.location.replace(confirmationURL.href);

    } catch (error) {
      console.error("Booking error:", error);

      /* Remove uploaded files if saving failed */

      if (uploadedPaths.length > 0) {
        try {
          const { error: cleanupError } =
            await supabaseClient
              .storage
              .from(STORAGE_BUCKET)
              .remove(uploadedPaths);

          if (cleanupError) {
            console.warn("File cleanup failed:", cleanupError.message);
          }
        } catch (cleanupError) {
          console.warn("File cleanup failed.");
        }
      }

      showMessage(
        message,
        "Booking save nahi hui: " +
          (error.message || "Please try again."),
        true
      );

    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Book Now";

      if (mediaInput) mediaInput.disabled = false;

      updateSelectedFiles();
    }
  });
}

/* ---------- BOOKING TRACKING ---------- */

const trackButton = document.getElementById("trackButton");

if (trackButton) {
  trackButton.addEventListener("click", async () => {
    const idInput = document.getElementById("trackingId");
    const phoneInput = document.getElementById("trackingPhone");
    const message = document.getElementById("trackingMessage");
    const result = document.getElementById("trackingResult");

    if (!idInput || !phoneInput || !message || !result) return;

    const bookingNumber =
      idInput.value.trim().toUpperCase();

    const phone = phoneInput.value.trim();

    result.hidden = true;
    result.replaceChildren();
    message.textContent = "";

    if (!bookingNumber || !phone) {
      showMessage(
        message,
        "Booking number aur registered phone number daalein.",
        true
      );
      return;
    }

    if (!supabaseClient) {
      showMessage(message, "Supabase load nahi hua.", true);
      return;
    }

    trackButton.disabled = true;
    showMessage(message, "Booking check ho rahi hai...");

    try {
      const { data, error } =
        await supabaseClient.rpc("track_booking", {
          p_booking_number: bookingNumber,
          p_phone: phone
        });

      if (error) throw error;

      const booking = Array.isArray(data) ? data[0] : null;

      if (!booking) {
        showMessage(
          message,
          "Booking nahi mili. Booking number aur phone check karein.",
          true
        );
        return;
      }

      const stages = [
        {
          status: "Submitted",
          title: "Booking Submitted",
          description: "Booking request receive ho gayi hai."
        },
        {
          status: "Confirmed",
          title: "Booking Confirmed",
          description: "Booking confirm ho gayi hai."
        },
        {
          status: "Editing In Progress",
          title: "Editing In Progress",
          description: "Aapka project edit ho raha hai."
        },
        {
          status: "Ready for Delivery",
          title: "Ready for Delivery",
          description: "Edited project delivery ke liye ready hai."
        },
        {
          status: "Completed",
          title: "Completed",
          description: "Project complete ho gaya hai."
        }
      ];

      const currentIndex = stages.findIndex(
        stage => stage.status === booking.status
      );

      const isCancelled = booking.status === "Cancelled";

      const timelineHTML = stages.map((stage, index) => {
        const done =
          !isCancelled &&
          currentIndex >= 0 &&
          index < currentIndex;

        const current =
          !isCancelled && currentIndex === index;

        const future =
          !isCancelled &&
          (currentIndex === -1 || index > currentIndex);

        const marker = done ? "✓" : current ? "●" : "○";

        const description = done
          ? "Yeh step complete ho gaya."
          : current
            ? stage.description
            : "Is step ka intezar hai.";

        return `
          <div class="order-step
            ${done ? "done" : ""}
            ${current ? "current" : ""}
            ${future ? "future" : ""}">
            <div class="step-marker">${marker}</div>
            <div class="step-content">
              <h3>${escapeHTML(stage.title)}</h3>
              <p>${escapeHTML(description)}</p>
            </div>
          </div>
        `;
      }).join("");

      let heading = "Booking Status";
      let statusDescription = "Update ke liye Aditya Editor se sampark karein.";

      if (isCancelled) {
        heading = "Booking Cancelled";
        statusDescription = "Yeh booking cancel ho gayi hai.";
      } else if (currentIndex >= 0) {
        heading = stages[currentIndex].title;
        statusDescription = stages[currentIndex].description;
      }

      result.innerHTML = `
        <div class="order-tracking-card">
          <div class="order-header">
            <span>BOOKING NUMBER</span>
            <strong>${escapeHTML(booking.booking_number)}</strong>
            <span class="status-pill">${escapeHTML(booking.status)}</span>
          </div>

          <div class="order-current-status">
            <h2>${escapeHTML(heading)}</h2>
            <p>${escapeHTML(statusDescription)}</p>
          </div>

          <div class="order-timeline">
            ${
              isCancelled
                ? `<div class="order-step cancelled">
                     <div class="step-marker">!</div>
                     <div class="step-content">
                       <h3>Booking Cancelled</h3>
                       <p>Madad ke liye Aditya Editor se sampark karein.</p>
                     </div>
                   </div>`
                : timelineHTML
            }
          </div>

          <div class="order-details">
            <h3>Booking Details</h3>
            <p><b>Customer Name:</b> ${escapeHTML(booking.customer_name)}</p>
            <p><b>Service:</b> ${escapeHTML(booking.service)}</p>
            <p><b>Booking Date:</b> ${escapeHTML(showDate(booking.created_at))}</p>
          </div>
        </div>
      `;

      result.hidden = false;
      showMessage(message, "Booking mil gayi hai.");

    } catch (error) {
      console.error("Tracking error:", error);

      showMessage(
        message,
        "Tracking error: " + (error.message || "Please try again."),
        true
      );

    } finally {
      trackButton.disabled = false;
    }
  });
}
