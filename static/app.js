/* ============================================================
   NUNES STOCK MANAGEMENT
   GLOBAL APP CONTROLLER
   app.js
   VERSION 21.0

   ADD STOCK / STOCK MOVEMENT
   ------------------------------------------------------------
   ✓ INWARD always selectable
   ✓ OUTWARD always selectable
   ✓ OUTWARD fields appear immediately
   ✓ Product lookup for existing stock
   ✓ New product allowed for INWARD
   ✓ New product blocked only at OUTWARD REVIEW
   ✓ Zero stock OUTWARD blocked only at REVIEW
   ✓ Quantity validation
   ✓ Current / After quantity
   ✓ Integer-style quantities
   ✓ Confirmation panel
   ✓ /stock-movement integration
   ✓ 3D inward/outward movement
   ✓ Automatic scroll to 3D movement
   ✓ Success screen
============================================================ */


(function () {

    "use strict";


    /* ========================================================
       BASIC HELPERS
    ======================================================== */

    function byId(id) {

        return document.getElementById(id);
    }


    function safeText(
        value,
        fallback = ""
    ) {

        const text =
            String(
                value === undefined ||
                value === null
                    ? ""
                    : value
            ).trim();

        return text || fallback;
    }


    function normalize(value) {

        return safeText(value)
            .toUpperCase()
            .replace(/\s+/g, " ");
    }


    function numberValue(value) {

        const number =
            Number(value);

        return Number.isFinite(number)
            ? number
            : 0;
    }


    function formatNumber(value) {

        const number =
            numberValue(value);

        if (Number.isInteger(number)) {

            return String(number);
        }

        return number.toLocaleString(
            undefined,
            {
                maximumFractionDigits: 2
            }
        );
    }


    function delay(ms) {

        return new Promise(
            function (resolve) {

                window.setTimeout(
                    resolve,
                    ms
                );
            }
        );
    }


    function setText(
        id,
        value
    ) {

        const element =
            byId(id);

        if (element) {

            element.textContent =
                value;
        }
    }


    function addClass(
        element,
        className
    ) {

        if (!element) {
            return;
        }

        element.classList.add(
            className
        );
    }


    function removeClass(
        element,
        ...classNames
    ) {

        if (!element) {
            return;
        }

        element.classList.remove(
            ...classNames
        );
    }


    function smoothScrollTo(
        element,
        block = "start"
    ) {

        if (!element) {
            return;
        }

        element.scrollIntoView(
            {
                behavior: "smooth",
                block: block
            }
        );
    }


    async function readJsonResponse(
        response
    ) {

        try {

            return await response.json();

        } catch (error) {

            return {};
        }
    }


    /* ========================================================
       MESSAGE
    ======================================================== */

    function clearMessage() {

        const message =
            byId("message");

        if (!message) {
            return;
        }

        message.textContent =
            "";

        message.className =
            "message";
    }


    function showError(text) {

        const message =
            byId("message");

        if (!message) {

            alert(text);
            return;
        }

        message.textContent =
            text;

        message.className =
            "message error";
    }


    function showSuccess(text) {

        const message =
            byId("message");

        if (!message) {
            return;
        }

        message.textContent =
            text;

        message.className =
            "message success";
    }


    /* ========================================================
       DASHBOARD COUNTERS
    ======================================================== */

    document
        .querySelectorAll(
            ".counter[data-target]"
        )
        .forEach(
            function (
                counter,
                index
            ) {

                const target =
                    numberValue(
                        counter.dataset.target
                    );

                window.setTimeout(
                    function () {

                        const start =
                            performance.now();

                        const duration =
                            800;


                        function frame(now) {

                            const progress =
                                Math.min(
                                    (
                                        now -
                                        start
                                    ) /
                                    duration,
                                    1
                                );

                            const eased =
                                1 -
                                Math.pow(
                                    1 -
                                    progress,
                                    3
                                );

                            counter.textContent =
                                Math.round(
                                    target *
                                    eased
                                );

                            if (
                                progress <
                                1
                            ) {

                                requestAnimationFrame(
                                    frame
                                );

                            } else {

                                counter.textContent =
                                    formatNumber(
                                        target
                                    );
                            }
                        }

                        requestAnimationFrame(
                            frame
                        );

                    },
                    index * 70
                );
            }
        );


    /* ========================================================
       STOCK MOVEMENT PAGE
    ======================================================== */

    const stockForm =
        byId("stockForm");


    if (stockForm) {


        /* ====================================================
           ELEMENTS
        ==================================================== */

        const movementTypeInput =
            byId("movementType");


        const inwardButton =
            byId("movementInward");


        const outwardButton =
            byId("movementOutward");


        const productId =
            byId("productId");


        const category =
            byId("category");


        const productName =
            byId("productName");


        const brand =
            byId("brand");


        const model =
            byId("model");


        const location =
            byId("location");


        const unit =
            byId("unit");


        const quantity =
            byId("quantity");


        const quantityMinus =
            byId("quantityMinus");


        const quantityPlus =
            byId("quantityPlus");


        const quickQuantityButtons =
            document.querySelectorAll(
                "[data-stock-quantity]"
            );


        const inwardInformation =
            byId("inwardInformation");


        const outwardInformation =
            byId("outwardInformation");


        const reviewButton =
            byId("reviewButton");


        const addButtonText =
            byId("addButtonText");


        const reviewMovementIcon =
            byId("reviewMovementIcon");


        const reviewButtonHint =
            byId("reviewButtonHint");


        const inwardReason =
            byId("inwardReason");


        const inwardSource =
            byId("inwardSource");


        const inwardReference =
            byId("inwardReference");


        const inwardReceivedBy =
            byId("inwardReceivedBy");


        const inwardRemarks =
            byId("inwardRemarks");


        const outwardReason =
            byId("outwardReason");


        const outwardDestination =
            byId("outwardDestination");


        const outwardReference =
            byId("outwardReference");


        const outwardIssuedTo =
            byId("outwardIssuedTo");


        const outwardRemarks =
            byId("outwardRemarks");


        const productStatusCard =
            byId("productStatusCard");


        const confirmPanel =
            byId("confirmPanel");


        const cancelConfirm =
            byId("cancelConfirm");


        const confirmAdd =
            byId("confirmAdd");


        const animationPanel =
            byId("stockAnimation");


        const successPanel =
            byId("successPanel");


        const addAnotherButton =
            byId("addAnotherButton");


        const exit3DButton =
            byId("exit3DButton");


        /* ====================================================
           STATE
        ==================================================== */

        let movementType =
            "inward";


        let currentStock =
            0;


        let loadedProduct =
            null;


        let savingMovement =
            false;


        let animationExited =
            false;


        let lookupTimer =
            null;


        /* ====================================================
           MOVEMENT DETAILS
        ==================================================== */

        function getReasonSelect() {

            return (
                movementType ===
                    "inward"
                    ? inwardReason
                    : outwardReason
            );
        }


        function getReasonValue() {

            const select =
                getReasonSelect();

            return select
                ? safeText(
                    select.value
                )
                : "";
        }


        function getReasonLabel() {

            const select =
                getReasonSelect();

            if (!select) {

                return "";
            }


            const option =
                select.options[
                    select.selectedIndex
                ];


            return option
                ? safeText(
                    option.textContent
                )
                : "";
        }


        function getMovementReference() {

            return (
                movementType ===
                    "inward"
                    ? safeText(
                        inwardReference
                            ? inwardReference.value
                            : ""
                    )
                    : safeText(
                        outwardReference
                            ? outwardReference.value
                            : ""
                    )
            );
        }


        function getMovementParty() {

            return (
                movementType ===
                    "inward"
                    ? safeText(
                        inwardSource
                            ? inwardSource.value
                            : ""
                    )
                    : safeText(
                        outwardDestination
                            ? outwardDestination.value
                            : ""
                    )
            );
        }


        function getMovementPerson() {

            return (
                movementType ===
                    "inward"
                    ? safeText(
                        inwardReceivedBy
                            ? inwardReceivedBy.value
                            : ""
                    )
                    : safeText(
                        outwardIssuedTo
                            ? outwardIssuedTo.value
                            : ""
                    )
            );
        }


        function getMovementRemarks() {

            const remarks =
                movementType ===
                    "inward"
                    ? safeText(
                        inwardRemarks
                            ? inwardRemarks.value
                            : ""
                    )
                    : safeText(
                        outwardRemarks
                            ? outwardRemarks.value
                            : ""
                    );


            const party =
                getMovementParty();


            const person =
                getMovementPerson();


            const parts =
                [];


            if (party) {

                parts.push(
                    movementType ===
                        "inward"
                        ? (
                            "Supplier / Source: " +
                            party
                        )
                        : (
                            "Customer / Destination: " +
                            party
                        )
                );
            }


            if (person) {

                parts.push(
                    movementType ===
                        "inward"
                        ? (
                            "Received By: " +
                            person
                        )
                        : (
                            "Issued To: " +
                            person
                        )
                );
            }


            if (remarks) {

                parts.push(
                    remarks
                );
            }


            return parts.join(
                " | "
            );
        }


        /* ====================================================
           STOCK VALUES
        ==================================================== */

        function getCurrentStock() {

            return Math.max(
                0,
                numberValue(
                    currentStock
                )
            );
        }


        function getMovementQuantity() {

            return Math.max(
                0,
                numberValue(
                    quantity
                        ? quantity.value
                        : 0
                )
            );
        }


        function calculateAfterStock() {

            const current =
                getCurrentStock();


            const moving =
                getMovementQuantity();


            if (
                movementType ===
                "outward"
            ) {

                return Math.max(
                    0,
                    current -
                    moving
                );
            }


            return (
                current +
                moving
            );
        }


        /* ====================================================
           MOVEMENT SELECTION
           IMPORTANT FIX:
           OUTWARD IS NEVER DISABLED HERE
        ==================================================== */

        function setMovementType(type) {

            clearMessage();


            movementType =
                type ===
                    "outward"
                    ? "outward"
                    : "inward";


            if (
                movementTypeInput
            ) {

                movementTypeInput.value =
                    movementType;
            }


            updateMovementUI();
        }


        function updateMovementUI() {

            const isInward =
                movementType ===
                    "inward";


            if (
                movementTypeInput
            ) {

                movementTypeInput.value =
                    movementType;
            }


            /* INWARD */

            if (inwardButton) {

                inwardButton.disabled =
                    false;


                inwardButton.classList.toggle(
                    "active",
                    isInward
                );
            }


            /* OUTWARD */

            if (outwardButton) {

                /*
                   CRITICAL:
                   Always clickable.
                */

                outwardButton.disabled =
                    false;


                outwardButton.classList.toggle(
                    "active",
                    !isInward
                );
            }


            /* SHOW / HIDE DETAILS */

            if (inwardInformation) {

                inwardInformation
                    .classList
                    .toggle(
                        "hidden",
                        !isInward
                    );
            }


            if (outwardInformation) {

                outwardInformation
                    .classList
                    .toggle(
                        "hidden",
                        isInward
                    );
            }


            setText(
                "quantitySectionDescription",
                isInward
                    ? "Enter how much stock is being received."
                    : "Enter how much stock is leaving inventory."
            );


            setText(
                "quantityControlTitle",
                isInward
                    ? "QUANTITY TO INWARD"
                    : "QUANTITY TO OUTWARD"
            );


            setText(
                "afterQuantityLabel",
                isInward
                    ? "AFTER INWARD"
                    : "AFTER OUTWARD"
            );


            const afterCard =
                byId(
                    "afterQuantityCard"
                );


            if (afterCard) {

                afterCard.classList.toggle(
                    "inward",
                    isInward
                );


                afterCard.classList.toggle(
                    "outward",
                    !isInward
                );
            }


            if (
                reviewMovementIcon
            ) {

                reviewMovementIcon.textContent =
                    isInward
                        ? "↓"
                        : "↑";
            }


            if (addButtonText) {

                addButtonText.textContent =
                    isInward
                        ? "REVIEW INWARD"
                        : "REVIEW OUTWARD";
            }


            if (reviewButton) {

                reviewButton
                    .classList
                    .toggle(
                        "outward",
                        !isInward
                    );
            }


            updateQuantityDisplay();
        }


        if (inwardButton) {

            inwardButton.addEventListener(
                "click",
                function () {

                    setMovementType(
                        "inward"
                    );
                }
            );
        }


        if (outwardButton) {

            outwardButton.addEventListener(
                "click",
                function () {

                    setMovementType(
                        "outward"
                    );
                }
            );
        }


        /* ====================================================
           PRODUCT STATUS
        ==================================================== */

        function hideProductStatus() {

            if (productStatusCard) {

                productStatusCard
                    .classList
                    .remove(
                        "active"
                    );
            }
        }


        function showRegisteredProductStatus(
            product
        ) {

            if (!productStatusCard) {

                return;
            }


            productStatusCard
                .classList
                .add(
                    "active"
                );


            setText(
                "productStatusName",
                safeText(
                    product.product_name,
                    "-"
                )
            );


            setText(
                "productStatusId",
                safeText(
                    product.product_id,
                    "-"
                )
            );


            setText(
                "productStatusStock",
                formatNumber(
                    product.current_quantity
                )
            );


            setText(
                "productRegistrationStatus",
                (
                    numberValue(
                        product.current_quantity
                    ) >
                    0
                        ? "Stock Registered"
                        : "Registered · Zero Stock"
                )
            );
        }


        function showNewProductStatus() {

            if (!productStatusCard) {

                return;
            }


            const enteredId =
                safeText(
                    productId
                        ? productId.value
                        : ""
                );


            if (!enteredId) {

                hideProductStatus();

                return;
            }


            productStatusCard
                .classList
                .add(
                    "active"
                );


            setText(
                "productStatusName",
                safeText(
                    productName
                        ? productName.value
                        : "",
                    "Product Master"
                )
            );


            setText(
                "productStatusId",
                enteredId
            );


            setText(
                "productStatusStock",
                "0"
            );


            setText(
                "productRegistrationStatus",
                movementType ===
                    "outward"
                    ? "Not Registered for Outward"
                    : "First Inward Registration"
            );
        }


        /* ====================================================
           PRODUCT LOOKUP
        ==================================================== */

        async function lookupProduct() {

            const id =
                normalize(
                    productId
                        ? productId.value
                        : ""
                );


            if (!id) {

                loadedProduct =
                    null;


                currentStock =
                    0;


                hideProductStatus();


                updateQuantityDisplay();

                return;
            }


            try {

                const response =
                    await fetch(
                        "/api/product/" +
                        encodeURIComponent(
                            id
                        ),
                        {
                            method:
                                "GET",

                            headers: {
                                "Accept":
                                    "application/json"
                            },

                            cache:
                                "no-store"
                        }
                    );


                /* PRODUCT NOT FOUND */

                if (
                    response.status ===
                    404
                ) {

                    loadedProduct =
                        null;


                    currentStock =
                        0;


                    showNewProductStatus();


                    updateQuantityDisplay();

                    return;
                }


                const data =
                    await readJsonResponse(
                        response
                    );


                if (
                    !response.ok ||
                    !data.success
                ) {

                    throw new Error(
                        data.message ||
                        "Unable to load product."
                    );
                }


                loadedProduct =
                    data.product ||
                    null;


                if (!loadedProduct) {

                    currentStock =
                        0;


                    showNewProductStatus();


                    updateQuantityDisplay();

                    return;
                }


                currentStock =
                    numberValue(
                        loadedProduct
                            .current_quantity
                    );


                /* AUTO FILL PRODUCT */

                if (productName) {

                    productName.value =
                        safeText(
                            loadedProduct
                                .product_name,
                            productName.value
                        );
                }


                if (
                    category &&
                    loadedProduct.category
                ) {
                    const existingCategory =
                        safeText(loadedProduct.category);

                    const categoryExists =
                        Array.from(category.options || [])
                            .some(function (option) {
                                return safeText(option.value) === existingCategory;
                            });

                    if (!categoryExists && existingCategory) {
                        const legacyOption =
                            document.createElement("option");

                        legacyOption.value =
                            existingCategory;

                        legacyOption.textContent =
                            existingCategory + " · Inventory";

                        legacyOption.dataset.inventoryOnly =
                            "true";

                        category.appendChild(
                            legacyOption
                        );
                    }

                    category.value =
                        existingCategory;
                }


                if (brand) {

                    brand.value =
                        safeText(
                            loadedProduct.brand,
                            ""
                        );
                }


                if (model) {

                    model.value =
                        safeText(
                            loadedProduct.model,
                            ""
                        );
                }


                if (location) {

                    location.value =
                        safeText(
                            loadedProduct.location,
                            "Category Storage"
                        );
                }


                if (
                    unit &&
                    loadedProduct.unit
                ) {

                    unit.value =
                        loadedProduct.unit;
                }


                showRegisteredProductStatus(
                    loadedProduct
                );


                updateQuantityDisplay();


            } catch (error) {

                console.error(
                    "Product lookup failed:",
                    error
                );


                loadedProduct =
                    null;


                currentStock =
                    0;


                showNewProductStatus();


                updateQuantityDisplay();
            }
        }


        function scheduleProductLookup() {

            if (lookupTimer) {

                clearTimeout(
                    lookupTimer
                );
            }


            lookupTimer =
                window.setTimeout(
                    lookupProduct,
                    350
                );
        }


        if (productId) {

            productId.addEventListener(
                "input",
                scheduleProductLookup
            );


            productId.addEventListener(
                "blur",
                lookupProduct
            );
        }


        /* ====================================================
           QUANTITY UI
        ==================================================== */

        function updateQuantityDisplay() {

            const current =
                getCurrentStock();


            const moving =
                getMovementQuantity();


            const after =
                calculateAfterStock();


            const selectedUnit =
                safeText(
                    unit
                        ? unit.value
                        : "",
                    "Nos"
                );


            setText(
                "currentStockValue",
                formatNumber(
                    current
                )
            );


            setText(
                "currentStockUnit",
                selectedUnit
            );


            setText(
                "afterStockValue",
                formatNumber(
                    after
                )
            );


            setText(
                "afterStockUnit",
                selectedUnit
            );


            if (!reviewButton) {

                return;
            }


            /*
               INWARD RULES
            */

            if (
                movementType ===
                "inward"
            ) {

                if (
                    moving <=
                    0
                ) {

                    reviewButton.disabled =
                        true;


                    if (reviewButtonHint) {

                        reviewButtonHint.textContent =
                            "Enter inward quantity";
                    }


                    return;
                }


                reviewButton.disabled =
                    false;


                if (reviewButtonHint) {

                    reviewButtonHint.textContent =
                        loadedProduct
                            ? "Check receiving details before confirming"
                            : "First inward will register this product";
                }


                return;
            }


            /*
               OUTWARD RULES

               OUTWARD TAB STILL REMAINS CLICKABLE.

               ONLY REVIEW IS BLOCKED.
            */

            if (!loadedProduct) {

                reviewButton.disabled =
                    true;


                if (reviewButtonHint) {

                    reviewButtonHint.textContent =
                        "Enter an existing Product ID for outward";
                }


                return;
            }


            if (
                current <=
                0
            ) {

                reviewButton.disabled =
                    true;


                if (reviewButtonHint) {

                    reviewButtonHint.textContent =
                        "No stock available for outward";
                }


                return;
            }


            if (
                moving <=
                0
            ) {

                reviewButton.disabled =
                    true;


                if (reviewButtonHint) {

                    reviewButtonHint.textContent =
                        "Enter outward quantity";
                }


                return;
            }


            if (
                moving >
                current
            ) {

                reviewButton.disabled =
                    true;


                if (reviewButtonHint) {

                    reviewButtonHint.textContent =
                        (
                            "Only " +
                            formatNumber(
                                current
                            ) +
                            " " +
                            selectedUnit +
                            " available"
                        );
                }


                return;
            }


            reviewButton.disabled =
                false;


            if (reviewButtonHint) {

                reviewButtonHint.textContent =
                    "Check dispatch details before confirming";
            }
        }


        /* ====================================================
           QUANTITY CONTROLS
        ==================================================== */

        if (quantityMinus) {

            quantityMinus.addEventListener(
                "click",
                function () {

                    if (!quantity) {

                        return;
                    }


                    quantity.value =
                        String(
                            Math.max(
                                1,
                                getMovementQuantity() -
                                1
                            )
                        );


                    updateQuantityDisplay();
                }
            );
        }


        if (quantityPlus) {

            quantityPlus.addEventListener(
                "click",
                function () {

                    if (!quantity) {

                        return;
                    }


                    let next =
                        getMovementQuantity() +
                        1;


                    /*
                       Allow input but cap outward
                       plus button to available stock.
                    */

                    if (
                        movementType ===
                            "outward" &&
                        loadedProduct &&
                        getCurrentStock() >
                            0
                    ) {

                        next =
                            Math.min(
                                next,
                                getCurrentStock()
                            );
                    }


                    quantity.value =
                        String(
                            Math.max(
                                1,
                                next
                            )
                        );


                    updateQuantityDisplay();
                }
            );
        }


        if (quantity) {

            quantity.addEventListener(
                "input",
                function () {

                    if (
                        numberValue(
                            quantity.value
                        ) <
                        0
                    ) {

                        quantity.value =
                            "0";
                    }


                    updateQuantityDisplay();
                }
            );
        }


        quickQuantityButtons.forEach(
            function (button) {

                button.addEventListener(
                    "click",
                    function () {

                        if (!quantity) {

                            return;
                        }


                        let value =
                            numberValue(
                                button.dataset
                                    .stockQuantity
                            );


                        if (
                            movementType ===
                                "outward" &&
                            loadedProduct &&
                            getCurrentStock() >
                                0
                        ) {

                            value =
                                Math.min(
                                    value,
                                    getCurrentStock()
                                );
                        }


                        quantity.value =
                            String(value);


                        updateQuantityDisplay();
                    }
                );
            }
        );


        if (unit) {

            unit.addEventListener(
                "change",
                updateQuantityDisplay
            );
        }


        /* ====================================================
           FORM VALIDATION
        ==================================================== */

        function validateMovement() {

            clearMessage();


            if (
                !stockForm.reportValidity()
            ) {

                return false;
            }


            const moving =
                getMovementQuantity();


            if (
                moving <=
                0
            ) {

                showError(
                    "Enter a quantity greater than zero."
                );

                return false;
            }


            if (
                movementType ===
                    "outward"
            ) {

                if (!loadedProduct) {

                    showError(
                        "OUTWARD requires an existing registered Product ID."
                    );

                    return false;
                }


                if (
                    getCurrentStock() <=
                    0
                ) {

                    showError(
                        "This product currently has no stock available for OUTWARD."
                    );

                    return false;
                }


                if (
                    moving >
                    getCurrentStock()
                ) {

                    showError(
                        (
                            "Outward quantity cannot exceed available stock. " +
                            "Available: " +
                            formatNumber(
                                getCurrentStock()
                            ) +
                            " " +
                            safeText(
                                unit
                                    ? unit.value
                                    : "",
                                "Nos"
                            )
                        )
                    );

                    return false;
                }
            }


            return true;
        }


        /* ====================================================
           CONFIRMATION PANEL
        ==================================================== */

        function openConfirmation() {

            if (
                !validateMovement()
            ) {

                return;
            }


            const isInward =
                movementType ===
                    "inward";


            const moving =
                getMovementQuantity();


            const current =
                getCurrentStock();


            const after =
                calculateAfterStock();


            const selectedUnit =
                safeText(
                    unit
                        ? unit.value
                        : "",
                    "Nos"
                );


            setText(
                "confirmTitle",
                isInward
                    ? (
                        loadedProduct
                            ? "Confirm Inward Stock"
                            : "Register Product & Confirm Inward"
                    )
                    : "Confirm Outward Stock"
            );


            setText(
                "confirmDescription",
                isInward
                    ? (
                        loadedProduct
                            ? "Review receiving information before stock enters storage."
                            : "This first inward will register the product and receive stock."
                    )
                    : "Review dispatch information before stock leaves storage."
            );


            const banner =
                byId(
                    "confirmMovementBanner"
                );


            if (banner) {

                banner.classList.toggle(
                    "inward",
                    isInward
                );


                banner.classList.toggle(
                    "outward",
                    !isInward
                );


                banner.textContent =
                    isInward
                        ? "↓ INWARD STOCK"
                        : "↑ OUTWARD STOCK";
            }


            setText(
                "confirmProduct",
                safeText(
                    productName
                        ? productName.value
                        : "",
                    "-"
                )
            );


            setText(
                "confirmProductId",
                safeText(
                    productId
                        ? productId.value
                        : "",
                    "-"
                )
            );


            setText(
                "confirmCurrentStock",
                (
                    formatNumber(
                        current
                    ) +
                    " " +
                    selectedUnit
                )
            );


            setText(
                "confirmMovementQuantityLabel",
                isInward
                    ? "INWARD"
                    : "OUTWARD"
            );


            setText(
                "confirmQty",
                (
                    (
                        isInward
                            ? "+"
                            : "−"
                    ) +
                    formatNumber(
                        moving
                    ) +
                    " " +
                    selectedUnit
                )
            );


            setText(
                "confirmNewStock",
                (
                    formatNumber(
                        after
                    ) +
                    " " +
                    selectedUnit
                )
            );


            setText(
                "confirmReason",
                getReasonLabel() ||
                "-"
            );


            setText(
                "confirmReference",
                getMovementReference() ||
                "-"
            );


            setText(
                "confirmParty",
                getMovementParty() ||
                "-"
            );


            if (confirmAdd) {

                confirmAdd.classList.toggle(
                    "outward",
                    !isInward
                );


                confirmAdd.textContent =
                    isInward
                        ? (
                            loadedProduct
                                ? "↓ CONFIRM INWARD"
                                : "↓ REGISTER & CONFIRM INWARD"
                        )
                        : "↑ CONFIRM OUTWARD";
            }


            removeClass(
                confirmPanel,
                "hidden"
            );


            smoothScrollTo(
                confirmPanel,
                "center"
            );
        }


        if (reviewButton) {

            reviewButton.addEventListener(
                "click",
                openConfirmation
            );
        }


        if (cancelConfirm) {

            cancelConfirm.addEventListener(
                "click",
                function () {

                    addClass(
                        confirmPanel,
                        "hidden"
                    );


                    smoothScrollTo(
                        stockForm,
                        "start"
                    );
                }
            );
        }


        /* ====================================================
           3D CATEGORY DATA
        ==================================================== */

        async function getCategoryRecords() {

            try {

                const response =
                    await fetch(
                        "/api/storage-categories",
                        {
                            method:
                                "GET",

                            headers: {
                                "Accept":
                                    "application/json"
                            },

                            cache:
                                "no-store"
                        }
                    );


                const data =
                    await readJsonResponse(
                        response
                    );


                if (
                    !response.ok ||
                    data.success ===
                        false
                ) {

                    return [];
                }


                return (
                    Array.isArray(
                        data.categories
                    )
                        ? data.categories
                        : []
                )
                    .map(
                        function (record) {

                            return {

                                category:
                                    safeText(
                                        record.category ||
                                        record.category_name ||
                                        record.name
                                    ),

                                productTypes:
                                    (
                                        record.productTypes ||
                                        record.product_types ||
                                        record.products ||
                                        []
                                    ).slice()
                            };
                        }
                    );


            } catch (error) {

                console.error(
                    "Unable to load category records:",
                    error
                );


                return [];
            }
        }


        /* ====================================================
           3D MOVEMENT
        ==================================================== */

        async function runMovementAnimation(
            result
        ) {

            if (
                !window.Stock3D ||
                typeof window.Stock3D
                    .animateStockMovement !==
                    "function"
            ) {

                await delay(
                    900
                );

                return;
            }


            const categoryRecords =
                await getCategoryRecords();


            if (
                categoryRecords.length &&
                typeof window.Stock3D
                    .prepareCategoryWarehouse ===
                    "function"
            ) {

                window.Stock3D
                    .prepareCategoryWarehouse(
                        {
                            categories:
                                categoryRecords
                        }
                    );
            }


            await delay(
                120
            );


            if (
                typeof window.Stock3D
                    .selectCategory ===
                    "function"
            ) {

                window.Stock3D
                    .selectCategory(
                        safeText(
                            category
                                ? category.value
                                : ""
                        )
                    );
            }


            if (
                typeof window.Stock3D
                    .resize ===
                    "function"
            ) {

                window.Stock3D.resize();
            }


            setText(
                "animationStatus",
                movementType ===
                    "inward"
                    ? "Receiving Stock"
                    : "Dispatching Stock"
            );


            setText(
                "animationDescription",
                movementType ===
                    "inward"
                    ? (
                        safeText(
                            productName
                                ? productName.value
                                : "",
                            "Product"
                        ) +
                        " is moving into storage."
                    )
                    : (
                        safeText(
                            productName
                                ? productName.value
                                : "",
                            "Product"
                        ) +
                        " is moving out of storage."
                    )
            );


            await window.Stock3D
                .animateStockMovement(
                    {
                        movementType:
                            movementType,

                        productId:
                            safeText(
                                productId
                                    ? productId.value
                                    : ""
                            ),

                        productName:
                            safeText(
                                productName
                                    ? productName.value
                                    : "",
                                "Product"
                            ),

                        category:
                            safeText(
                                category
                                    ? category.value
                                    : ""
                            ),

                        quantity:
                            getMovementQuantity(),

                        unit:
                            safeText(
                                unit
                                    ? unit.value
                                    : "",
                                "Nos"
                            )
                    }
                );
        }


        /* ====================================================
           SAVE MOVEMENT
        ==================================================== */

        async function saveMovement() {

            if (
                savingMovement
            ) {

                return;
            }


            if (
                !validateMovement()
            ) {

                return;
            }


            savingMovement =
                true;


            animationExited =
                false;


            const originalButtonText =
                confirmAdd
                    ? confirmAdd.textContent
                    : "";


            if (confirmAdd) {

                confirmAdd.disabled =
                    true;


                confirmAdd.textContent =
                    "Processing...";
            }


            const payload = {

                product_id:
                    safeText(
                        productId
                            ? productId.value
                            : ""
                    ),

                product_name:
                    safeText(
                        productName
                            ? productName.value
                            : ""
                    ),

                category:
                    safeText(
                        category
                            ? category.value
                            : ""
                    ),

                brand:
                    safeText(
                        brand
                            ? brand.value
                            : ""
                    ),

                model:
                    safeText(
                        model
                            ? model.value
                            : ""
                    ),

                movement_type:
                    movementType,

                quantity:
                    getMovementQuantity(),

                unit:
                    safeText(
                        unit
                            ? unit.value
                            : "",
                        "Nos"
                    ),

                location:
                    safeText(
                        location
                            ? location.value
                            : "",
                        "Category Storage"
                    ),

                reason:
                    getReasonValue(),

                reason_label:
                    getReasonLabel(),

                reference:
                    getMovementReference(),

                remarks:
                    getMovementRemarks()
            };


            try {

                clearMessage();


                addClass(
                    confirmPanel,
                    "hidden"
                );


                removeClass(
                    animationPanel,
                    "hidden"
                );


                smoothScrollTo(
                    animationPanel,
                    "start"
                );


                await delay(
                    600
                );


                const response =
                    await fetch(
                        "/stock-movement",
                        {
                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/json",

                                "Accept":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );


                const data =
                    await readJsonResponse(
                        response
                    );


                if (
                    !response.ok ||
                    !data.success
                ) {

                    throw new Error(
                        data.message ||
                        "Unable to process stock movement."
                    );
                }


                const result =
                    data.result;


                if (!result) {

                    throw new Error(
                        "Stock movement result is missing."
                    );
                }


                if (
                    !animationExited
                ) {

                    await runMovementAnimation(
                        result
                    );
                }


                currentStock =
                    numberValue(
                        result.new_quantity
                    );


                if (
                    loadedProduct
                ) {

                    loadedProduct
                        .current_quantity =
                        currentStock;

                } else if (
                    movementType ===
                    "inward"
                ) {

                    loadedProduct = {

                        product_id:
                            payload.product_id,

                        product_name:
                            payload.product_name,

                        category:
                            payload.category,

                        brand:
                            payload.brand,

                        model:
                            payload.model,

                        current_quantity:
                            currentStock,

                        unit:
                            payload.unit,

                        location:
                            payload.location
                    };
                }


                if (loadedProduct) {

                    showRegisteredProductStatus(
                        loadedProduct
                    );
                }


                addClass(
                    animationPanel,
                    "hidden"
                );


                updateQuantityDisplay();


                showMovementSuccess(
                    result
                );


            } catch (error) {

                console.error(
                    "STOCK MOVEMENT ERROR:",
                    error
                );


                addClass(
                    animationPanel,
                    "hidden"
                );


                showError(
                    error.message ||
                    "Unable to process stock movement."
                );


                smoothScrollTo(
                    stockForm,
                    "start"
                );


            } finally {

                savingMovement =
                    false;


                if (confirmAdd) {

                    confirmAdd.disabled =
                        false;


                    confirmAdd.textContent =
                        originalButtonText;
                }
            }
        }


        if (confirmAdd) {

            confirmAdd.addEventListener(
                "click",
                saveMovement
            );
        }


        /* ====================================================
           EXIT 3D
        ==================================================== */

        if (exit3DButton) {

            exit3DButton.addEventListener(
                "click",
                function () {

                    animationExited =
                        true;


                    addClass(
                        animationPanel,
                        "hidden"
                    );


                    smoothScrollTo(
                        stockForm,
                        "start"
                    );
                }
            );
        }


        /* ====================================================
           SUCCESS
        ==================================================== */

        function showMovementSuccess(
            result
        ) {

            const isInward =
                (
                    result.movement_type ||
                    movementType
                ) ===
                "inward";


            const selectedUnit =
                safeText(
                    result.unit ||
                    (
                        unit
                            ? unit.value
                            : ""
                    ),
                    "Nos"
                );


            if (successPanel) {

                successPanel.classList.toggle(
                    "outward",
                    !isInward
                );
            }


            setText(
                "successMovementText",
                isInward
                    ? "INWARD STOCK COMPLETED"
                    : "OUTWARD STOCK COMPLETED"
            );


            setText(
                "successProductName",
                safeText(
                    productName
                        ? productName.value
                        : "",
                    "Product"
                )
            );


            setText(
                "successOld",
                (
                    formatNumber(
                        result.previous_quantity
                    ) +
                    " " +
                    selectedUnit
                )
            );


            setText(
                "successMovementLabel",
                isInward
                    ? "Inward"
                    : "Outward"
            );


            setText(
                "successAdded",
                (
                    (
                        isInward
                            ? "+"
                            : "−"
                    ) +
                    formatNumber(
                        result.quantity_added
                    ) +
                    " " +
                    selectedUnit
                )
            );


            setText(
                "successNew",
                (
                    formatNumber(
                        result.new_quantity
                    ) +
                    " " +
                    selectedUnit
                )
            );


            removeClass(
                successPanel,
                "hidden"
            );


            smoothScrollTo(
                successPanel,
                "center"
            );
        }


        /* ====================================================
           RESET
        ==================================================== */

        function resetMovementForm() {

            stockForm.reset();


            movementType =
                "inward";


            currentStock =
                0;


            loadedProduct =
                null;


            savingMovement =
                false;


            animationExited =
                false;


            if (
                movementTypeInput
            ) {

                movementTypeInput.value =
                    "inward";
            }


            if (quantity) {

                quantity.value =
                    "1";
            }


            hideProductStatus();


            addClass(
                successPanel,
                "hidden"
            );


            addClass(
                confirmPanel,
                "hidden"
            );


            addClass(
                animationPanel,
                "hidden"
            );


            clearMessage();


            updateMovementUI();


            smoothScrollTo(
                stockForm,
                "start"
            );


            window.setTimeout(
                function () {

                    if (productId) {

                        productId.focus();
                    }
                },
                300
            );
        }


        if (addAnotherButton) {

            addAnotherButton.addEventListener(
                "click",
                resetMovementForm
            );
        }


        /* ====================================================
           INITIAL STATE
        ==================================================== */

        updateMovementUI();

    }


    /* ========================================================
       CURRENT STOCK SEARCH
    ======================================================== */

    const stockSearch =
        byId("stockSearch");


    const stockTable =
        byId("stockTable");


    const visibleProductCount =
        byId("visibleProductCount");


    const noSearchResult =
        byId("noSearchResult");


    if (
        stockSearch &&
        stockTable
    ) {

        stockSearch.addEventListener(
            "input",
            function () {

                const searchText =
                    stockSearch
                        .value
                        .trim()
                        .toLowerCase();


                const rows =
                    stockTable
                        .querySelectorAll(
                            "tbody tr.current-stock-row"
                        );


                let visible =
                    0;


                rows.forEach(
                    function (row) {

                        const rowText =
                            row.innerText
                                .toLowerCase();


                        const matches =
                            rowText.includes(
                                searchText
                            );


                        row.style.display =
                            matches
                                ? ""
                                : "none";


                        if (matches) {

                            visible += 1;
                        }
                    }
                );


                if (
                    visibleProductCount
                ) {

                    visibleProductCount
                        .textContent =
                        String(visible);
                }


                if (
                    noSearchResult
                ) {

                    noSearchResult
                        .classList
                        .toggle(
                            "hidden",
                            !(
                                visible ===
                                    0 &&
                                searchText !==
                                    ""
                            )
                        );
                }
            }
        );
    }

})();