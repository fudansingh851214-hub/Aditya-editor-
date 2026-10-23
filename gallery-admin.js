"use strict";

/* =========================================
   ADITYA EDITOR — ADMIN GALLERY
   Supabase | Upload | Preview | Publish
   Hide | Delete | Signed Media URLs
========================================= */

(() => {
  const SUPABASE_URL =
    "https://okzwtylpmcyurkxvaocy.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_PjYL34jyFif4E6eHc7HYJQ_y-5SAs0";

  const BUCKET = "service-gallery";

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
  const SIGNED_URL_SECONDS = 3600;

  if (!window.supabase) {
    console.error("Supabase library नहीं मिली।");
    alert("Supabase library लोड नहीं हुई। HTML में Supabase script जाँचें।");
    return;
  }

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  const form = document.getElementById("galleryUploadForm");
  const fileInput = document.getElementById("galleryFile");
  const titleInput = document.getElementById("galleryTitle");
  const serviceInput = document.getElementById("galleryService");
  const uploadButton = document.getElementById("galleryUploadButton");
  const message = document.getElementById("galleryMessage");
  const list = document.getElementById("galleryAdminList");
  const refreshButton = document.getElementById("refreshGalleryButton");

  if (!form || !fileInput || !titleInput || !serviceInput ||
      !uploadButton || !message || !list || !refreshButton) {
    console.error("Admin Gallery HTML elements नहीं मिले।");
    return;
  }

  const allowedServices = [
    "Photo Editing",
    "Video Editing",
    "Wedding Projects",
    "Graphic Design",
    "Social Media Reels"
  ];

  let authorized = false;
  let loadingGallery = false;

  function say(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#ff657a" : "#10c98a";
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function makeButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn " + className;
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
  }

  async function verifyAdmin() {
    const {
      data: { user } = {},
      error: authError
    } = await client.auth.getUser();

    if (authError || !user) {
      authorized = false;
      say("Admin Login नहीं मिला। पहले Login करें।", true);
      return false;
    }

    // यह RPC आपके Supabase project में मौजूद होना चाहिए।
    const { data: isAdmin, error: roleError } =
      await client.rpc("is_admin");

    if (roleError) {
      authorized = false;
      say(
        "Admin permission जाँच नहीं हुई: " + roleError.message,
        true
      );
      return false;
    }

    if (isAdmin !== true) {
      authorized = false;
      say("इस अकाउंट को Admin permission नहीं मिली।", true);
      return false;
    }

    authorized = true;
    return true;
  }

  async function createMediaUrl(filePath) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("फाइल का path खाली है।");
    }

    // Signed URL private और public दोनों buckets में
    // उचित Storage permissions के साथ काम कर सकता है।
    const { data, error } = await client.storage
      .from(BUCKET)
      .createSignedUrl(filePath, SIGNED_URL_SECONDS);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || !data.signedUrl) {
      throw new Error("Supabase ने Media URL नहीं दिया।");
    }

    return data.signedUrl;
  }

  async function loadGallery() {
    if (loadingGallery) return;

    loadingGallery = true;
    refreshButton.disabled = true;

    try {
      if (!(await verifyAdmin())) {
        list.replaceChildren();
        return;
      }

      list.replaceChildren(
        makeElement("p", "muted", "Gallery लोड हो रही है...")
      );

      const { data, error } = await client
        .from("service_gallery")
        .select(
          "id,title,service,media_type,file_path,is_active,created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        list.replaceChildren();
        say("Gallery लोड नहीं हुई: " + error.message, true);
        return;
      }

      list.replaceChildren();

      if (!data || data.length === 0) {
        list.append(
          makeElement("p", "muted", "अभी कोई फोटो या वीडियो नहीं है।")
        );
        say("Gallery खाली है।");
        return;
      }

      let failedMedia = 0;

      for (const item of data) {
        const record = makeElement("article", "record");
        const heading = makeElement("h3", "", item.title || "Untitled");
        const details = makeElement(
          "p",
          "muted",
          `${item.service || "Service"} • ${item.media_type || "Media"} • ${
            item.is_active ? "Published" : "Hidden"
          }`
        );

        record.append(heading, details);

        const mediaType = String(item.media_type || "").toLowerCase();
        const isVideo = mediaType === "video";

        const media = document.createElement(isVideo ? "video" : "img");
        media.style.cssText =
          "width:100%;max-width:420px;max-height:300px;" +
          "object-fit:contain;display:block;margin:12px 0;" +
          "background:#171717;border-radius:8px;";

        if (isVideo) {
          media.controls = true;
          media.preload = "metadata";
          media.playsInline = true;
        } else {
          media.alt = item.title || "Gallery image";
          media.loading = "lazy";
        }

        try {
          const mediaUrl = await createMediaUrl(item.file_path);
          media.src = mediaUrl;

          media.addEventListener("error", () => {
            console.error("Media load failed:", item.file_path);
          }, { once: true });

          record.append(media);
        } catch (error) {
          failedMedia++;

          record.append(
            makeElement(
              "p",
              "muted",
              "मीडिया URL नहीं बना: " + error.message
            )
          );

          console.error(
            "Gallery media URL error:",
            item.file_path,
            error
          );
        }

        const actions = makeElement("div", "record-actions");

        const toggleButton = makeButton(
          item.is_active ? "Hide from customers" : "Publish",
          "btn-secondary",
          async () => {
            if (!(await verifyAdmin())) return;

            toggleButton.disabled = true;

            try {
              const { error: updateError } = await client
                .from("service_gallery")
                .update({ is_active: !item.is_active })
                .eq("id", item.id);

              if (updateError) {
                say("Status नहीं बदला: " + updateError.message, true);
                return;
              }

              say("Gallery status अपडेट हो गया।");
              await loadGallery();
            } finally {
              toggleButton.disabled = false;
            }
          }
        );

        const deleteButton = makeButton(
          "Delete",
          "btn-danger",
          async () => {
            const confirmed = window.confirm(
              "क्या आप इस फोटो/वीडियो को स्थायी रूप से हटाना चाहते हैं?"
            );

            if (!confirmed) return;
            if (!(await verifyAdmin())) return;

            deleteButton.disabled = true;

            try {
              const { error: fileError } = await client.storage
                .from(BUCKET)
                .remove([item.file_path]);

              if (fileError) {
                say(
                  "Storage file नहीं हटी: " + fileError.message,
                  true
                );
                return;
              }

              const { error: rowError } = await client
                .from("service_gallery")
                .delete()
                .eq("id", item.id);

              if (rowError) {
                say(
                  "फाइल हट गई, लेकिन Database record नहीं हटा: " +
                  rowError.message,
                  true
                );
                return;
              }

              say("Gallery item हटा दिया गया।");
              await loadGallery();
            } finally {
              deleteButton.disabled = false;
            }
          }
        );

        actions.append(toggleButton, deleteButton);
        record.append(actions);
        list.append(record);
      }

      if (failedMedia > 0) {
        say(
          `${data.length} रिकॉर्ड मिले; ${failedMedia} मीडिया URL नहीं बन पाए। Storage permissions और file_path जाँचें।`,
          true
        );
      } else {
        say(`Gallery लोड हो गई। कुल ${data.length} आइटम।`);
      }
    } catch (error) {
      console.error("Gallery error:", error);
      say("Gallery Error: " + error.message, true);
    } finally {
      loadingGallery = false;
      refreshButton.disabled = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!(await verifyAdmin())) return;

    const title = titleInput.value.trim();
    const service = serviceInput.value;
    const file = fileInput.files && fileInput.files[0];

    if (!title || !allowedServices.includes(service) || !file) {
      say("Title, Service और File चुनें।", true);
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      say("केवल मान्य फोटो या वीडियो फाइल चुनें।", true);
      return;
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      say("फोटो का आकार 10 MB से कम रखें।", true);
      return;
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      say("वीडियो का आकार 50 MB से कम रखें।", true);
      return;
    }

    uploadButton.disabled = true;
    say("फोटो/वीडियो अपलोड हो रहा है...");

    let filePath = null;
    let uploaded = false;

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const folder = service.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      filePath = `${folder}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await client.storage
        .from(BUCKET)
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;
      uploaded = true;

      const { error: insertError } = await client
        .from("service_gallery")
        .insert({
          title,
          service,
          media_type: isVideo ? "video" : "image",
          file_path: filePath,
          is_active: true
        });

      if (insertError) {
        // रिकॉर्ड insert न होने पर अपलोड हुई फाइल साफ करने की कोशिश।
        const { error: cleanupError } = await client.storage
          .from(BUCKET)
          .remove([filePath]);

        if (cleanupError) {
          throw new Error(
            "Database insert failed: " + insertError.message +
            " | Storage cleanup failed: " + cleanupError.message
          );
        }

        uploaded = false;
        throw insertError;
      }

      uploaded = false;
      form.reset();
      say("फोटो/वीडियो सफलतापूर्वक अपलोड और प्रकाशित हुआ।");

      await loadGallery();
    } catch (error) {
      console.error("Upload error:", error);

      say(
        "Upload Error: " + (error.message || "अज्ञात त्रुटि"),
        true
      );

      // यदि रिकॉर्ड बनाते समय अनपेक्षित त्रुटि हुई हो तो
      // फाइल हटाने का प्रयास; हटाने में विफलता console में दिखेगी।
      if (uploaded && filePath) {
        const { error: cleanupError } = await client.storage
          .from(BUCKET)
          .remove([filePath]);

        if (cleanupError) {
          console.error("Storage cleanup failed:", cleanupError);
        }
      }
    } finally {
      uploadButton.disabled = false;
    }
  });

  refreshButton.addEventListener("click", loadGallery);

  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      authorized = false;
      list.replaceChildren();
      say("Logout हो गया। Gallery देखने के लिए Admin Login करें।", true);
    }
  });

  loadGallery();
})();