(() => {
    "use strict";

    const input = document.getElementById("openRackFileInput");
    const label = document.querySelector("[data-open-rack-upload-label]");

    if (!input) return;

    input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;

        const name = String(file.name || "").toLowerCase();
        if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
            window.alert("Please select an Excel .xlsx or .xls file.");
            input.value = "";
            return;
        }

        const form = new FormData();
        form.append("file", file);

        if (label) {
            label.textContent = "Loading Open Rack Master...";
            label.classList.add("storage-upload-busy");
        }

        try {
            const response = await fetch("/storage-view/upload/open-rack", {
                method: "POST",
                body: form,
                credentials: "same-origin"
            });

            let payload = {};
            try { payload = await response.json(); } catch (_) {}

            if (!response.ok || payload.success === false) {
                throw new Error(payload.message || "Open Rack Excel import failed.");
            }

            try {
                window.sessionStorage.setItem("nunes_storage_mode", "open");
            } catch (_) {}

            window.location.reload();
        } catch (error) {
            if (label) {
                label.textContent = "Attach Open Rack Master";
                label.classList.remove("storage-upload-busy");
            }
            input.value = "";
            window.alert(error.message || "Unable to load Open Rack Excel.");
        }
    });
})();
