const fs = require("fs");
const path = "public/admin.html";
let c = fs.readFileSync(path, "utf8");

const OLD = `    async function sendBroadcast() {
      const textarea =
        document.getElementById(
          "broadcastMsg"
        );

      const message =
        textarea.value.trim();

      if (
        !message &&
        !broadcastPhotoBase64
      ) {
        alert(
          "يرجى كتابة رسالة أو إرفاق صورة على الأقل."
        );

        return;
      }

      const confirmText =
        broadcastPhotoBase64
          ? "هل تريد إرسال هذه الصورة (مع الرسالة إن وجدت) إلى جميع اللاعبين؟"
          : "هل تريد إرسال هذه الرسالة إلى جميع اللاعبين؟";

      if (
        !confirm(
          confirmText
        )
      ) {
        return;
      }

      try {
        const payload = {
          message,
        };

        if (
          broadcastPhotoBase64
        ) {
          payload.photoBase64 =
            broadcastPhotoBase64;

          payload.photoMime =
            broadcastPhotoMime;
        }

        const result =
          await apiCall(
            "/api/admin/broadcast",
            "POST",
            payload
          );

        if (result.success) {
          alert(
            \`تم الإرسال بنجاح إلى \${
              result.sentCount || 0
            } مستخدم.\`
          );

          textarea.value = "";

          clearBroadcastPhoto();
        } else {
          alert(
            result.error ||
            "فشل إرسال الرسالة."
          );
        }
      } catch (err) {
        alert(
          err.message ||
          "تعذر الاتصال بالسيرفر."
        );
      }
    }`;

const NEW = `    async function sendBroadcast() {
      const textarea =
        document.getElementById(
          "broadcastMsg"
        );

      const message =
        textarea.value.trim();

      if (
        !message &&
        !broadcastPhotoBase64
      ) {
        alert(
          "يرجى كتابة رسالة أو إرفاق صورة على الأقل."
        );

        return;
      }

      const confirmText =
        broadcastPhotoBase64
          ? "هل تريد إرسال هذه الصورة (مع الرسالة إن وجدت) إلى جميع اللاعبين؟"
          : "هل تريد إرسال هذه الرسالة إلى جميع اللاعبين؟";

      if (
        !confirm(
          confirmText
        )
      ) {
        return;
      }

      const btn = document.querySelector(
        'button[onclick="sendBroadcast()"]'
      );
      const originalLabel = btn
        ? btn.textContent
        : "";

      if (btn) {
        btn.disabled = true;
      }

      try {
        const payload = {
          message,
        };

        if (
          broadcastPhotoBase64
        ) {
          payload.photoBase64 =
            broadcastPhotoBase64;

          payload.photoMime =
            broadcastPhotoMime;
        }

        let totalSent = 0;
        let offset = 0;
        let totalPlayers = 0;
        let done = false;

        while (!done) {
          const result =
            await apiCall(
              "/api/admin/broadcast",
              "POST",
              { ...payload, offset }
            );

          if (!result.success) {
            alert(
              result.error ||
              "فشل إرسال الرسالة."
            );

            return;
          }

          totalSent += result.sentCount || 0;
          totalPlayers = result.totalPlayers || totalPlayers;
          done = !!result.done;
          offset = result.nextOffset ?? offset;

          if (btn && !done) {
            btn.textContent = \`جاري الإرسال... \${totalSent}/\${totalPlayers}\`;
          }
        }

        alert(
          \`تم الإرسال بنجاح إلى \${totalSent} مستخدم.\`
        );

        textarea.value = "";

        clearBroadcastPhoto();
      } catch (err) {
        alert(
          err.message ||
          "تعذر الاتصال بالسيرفر."
        );
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      }
    }`;

if (c.includes(NEW)) {
  console.log("already patched");
  process.exit(0);
}
if (!c.includes(OLD)) {
  console.log("pattern not found");
  process.exit(1);
}
c = c.replace(OLD, NEW);
fs.writeFileSync(path, c);
console.log("patched OK");
