/* ============================================================
   NUNES STOCK MANAGEMENT
   STORAGE VIEW CONTROLLER
   storage_view.js
   VERSION 20.1

   STORAGE VIEW = PREVIEW / INSPECTION ONLY

   FIXES
   ------------------------------------------------------------
   ✓ Waits for Stock3D before initialization
   ✓ Prevents empty warehouse on startup
   ✓ Loads 12 categories from backend
   ✓ Builds all 3D cabinets
   ✓ Starts from first real category
   ✓ FIRST changes cabinet + table
   ✓ PREVIOUS changes cabinet + table
   ✓ NEXT changes cabinet + table
   ✓ LAST changes cabinet + table
   ✓ ‹ › changes cabinet + table
   ✓ Cabinet click opens cabinet
   ✓ Cabinet click does NOT scroll down
   ✓ View Category Products scrolls down
   ✓ Permanent ↑ returns to 3D warehouse
   ✓ Product row click scrolls to details
   ✓ Clear product detail card
   ✓ Integer stock display
   ✓ Add/Edit/Delete category support
============================================================ */

(function () {

    "use strict";


    /* ========================================================
       ROOT
    ======================================================== */

    const app =
        document.getElementById(
            "storageViewApp"
        );


    if (!app) {

        return;
    }


    /* ========================================================
       HELPERS
    ======================================================== */

    function byId(id) {

        return document.getElementById(
            id
        );
    }


    function safeText(
        value,
        fallback = ""
    ) {

        const text =
            String(
                value === null ||
                value === undefined
                    ? ""
                    : value
            ).trim();


        return text || fallback;
    }


    function normalize(value) {

        return safeText(
            value
        )
            .toUpperCase()
            .replace(
                /\s+/g,
                " "
            );
    }


    function normalizeLoose(value) {

        return normalize(
            value
        ).replace(
            /[^A-Z0-9]/g,
            ""
        );
    }


    function numberValue(value) {

        const number =
            Number(
                value
            );


        return Number.isFinite(
            number
        )
            ? number
            : 0;
    }


    function formatNumber(value) {

        const number =
            numberValue(
                value
            );


        if (
            Number.isInteger(
                number
            )
        ) {

            return String(
                number
            );
        }


        return number.toLocaleString(
            undefined,
            {
                maximumFractionDigits:
                    2
            }
        );
    }


    function escapeHtml(value) {

        return String(
            value === null ||
            value === undefined
                ? ""
                : value
        )
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#039;"
            );
    }


    function setText(
        id,
        value
    ) {

        const element =
            byId(
                id
            );


        if (element) {

            element.textContent =
                value;
        }
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


    async function readJsonResponse(
        response
    ) {

        try {

            return await response.json();

        } catch (error) {

            return {};
        }
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
                behavior:
                    "smooth",

                block:
                    block
            }
        );
    }


    /* ========================================================
       STATUS MESSAGE
    ======================================================== */

    function showMessage(
        message,
        type = ""
    ) {

        const element =
            byId(
                "storageActionMessage"
            );


        if (!element) {

            return;
        }


        element.className =
            "storage-status-message";


        if (type) {

            element.classList.add(
                type
            );
        }


        element.textContent =
            message;
    }


    function setStageStatus(text) {

        setText(
            "stageStatus",
            text
        );
    }


    /* ========================================================
       WAIT FOR STOCK3D
       CRITICAL STARTUP FIX
    ======================================================== */

    async function waitForStock3D(
        timeoutMs = 10000
    ) {

        const started =
            Date.now();


        while (
            Date.now() -
            started <
            timeoutMs
        ) {

            if (
                window.Stock3D &&
                typeof window.Stock3D
                    .prepareCategoryWarehouse ===
                    "function" &&
                typeof window.Stock3D
                    .moveToCategoryIndex ===
                    "function"
            ) {

                return true;
            }


            await delay(
                100
            );
        }


        return false;
    }


    /* ========================================================
       CATEGORY CODE
    ======================================================== */

    const CATEGORY_CODE_MAP = {

        "GAS TESTING & ANALYSER":
            "GAS",

        "LABORATORY TESTING & MEASURING":
            "LAB",

        "HYDROLOGY INSTRUMENTS":
            "HYD",

        "METROLOGY TESTING & MEASURING":
            "MET",

        "AGRICULTURE TESTING & MEASURING":
            "AGR",

        "SOIL & WATER TESTING":
            "SWT",

        "FOOD PROCESSING MACHINERIES":
            "FPM",

        "JUICE PROCESSING MACHINERIES":
            "JPM",

        "PACKAGING MACHINERIES":
            "PKG",

        "SNACKS PROCESSING MACHINERIES":
            "SNK",

        "BAKERY PROCESSING MACHINERIES":
            "BAK",

        "SEED & GRAIN MACHINERIES":
            "SGM"
    };


    function getCategoryCode(
        category
    ) {

        const name =
            normalize(
                category
            );


        if (
            CATEGORY_CODE_MAP[
                name
            ]
        ) {

            return CATEGORY_CODE_MAP[
                name
            ];
        }


        const words =
            name
                .split(
                    " "
                )
                .filter(Boolean);


        let code =
            words
                .slice(
                    0,
                    3
                )
                .map(
                    function (word) {

                        return word
                            .replace(
                                /[^A-Z0-9]/g,
                                ""
                            )
                            .slice(
                                0,
                                1
                            );
                    }
                )
                .join(
                    ""
                );


        if (
            code.length <
            2
        ) {

            code =
                name
                    .replace(
                        /[^A-Z0-9]/g,
                        ""
                    )
                    .slice(
                        0,
                        3
                    );
        }


        return (
            code ||
            "CAT"
        );
    }


    function buildMasterProductId(
        category,
        index
    ) {

        return (
            getCategoryCode(
                category
            ) +
            "-" +
            String(
                index + 1
            ).padStart(
                3,
                "0"
            )
        );
    }


    function buildStoragePosition(
        category
    ) {

        return (
            "CAB-" +
            getCategoryCode(
                category
            )
        );
    }


    /* ========================================================
       IMAGE MAP
    ======================================================== */

    const IMAGE_MAP = {

        "AGGREGATE IMPACT TESTING MACHINE":
            "aggregate_impact_testing_machine.jpg",

        "ANALYTICAL BALANCE":
            "analytical_balance.jpg",

        "BENCH TOP PH METER":
            "bench_top_ph_meter.jpg",

        "BITUMEN PENETROMETER":
            "bitumen_penetrometer.jpg",

        "BOD INCUBATOR":
            "bod_incubator.jpg",

        "CBR TEST APPARATUS":
            "cbr_test_apparatus.jpg",

        "COLONY COUNTER":
            "colony_counter.jpg",

        "COMPRESSION TESTING MACHINE":
            "compression_testing_machine.jpg",

        "LABORATORY HOT PLATE":
            "laboratory_hot_plate.jpg",

        "LABORATORY INCUBATOR":
            "laboratory_incubator.jpg"
    };


    function getProductImageUrl(
        productName
    ) {

        const filename =
            IMAGE_MAP[
                normalize(
                    productName
                )
            ];


        return filename
            ? (
                "/static/product_images/" +
                filename
            )
            : "";
    }


    /* ========================================================
       DATABASE PRODUCTS
    ======================================================== */

    let databaseProducts =
        [];


    try {

        const source =
            byId(
                "openRackProductsData"
            );


        databaseProducts =
            JSON.parse(
                source
                    ? source.textContent
                    : "[]"
            );


        if (
            !Array.isArray(
                databaseProducts
            )
        ) {

            databaseProducts =
                [];
        }

    } catch (error) {

        console.error(
            "Could not read product data:",
            error
        );


        databaseProducts =
            [];
    }


    /* ========================================================
       STATE
    ======================================================== */

    let categoryRecords =
        [];


    let categoryProductTypes =
        {};


    let categoryMeta =
        {};


    let categoryNames =
        [];


    let selectedCategory =
        null;


    let navigationIndex =
        0;


    let currentTableRows =
        [];


    let selectedDisplayRecord =
        null;


    let selectedProductRecord =
        null;


    let navigationBusy =
        false;


    let openingCabinet =
        false;


    let initialized =
        false;


    /* ========================================================
       MODAL STATE
    ======================================================== */

    let categoryModalMode =
        "create";


    let editingOriginalCategory =
        null;


    let categoryModalProductTypes =
        [];


    let deleteCategoryButton =
        null;


    /* ========================================================
       DOM ELEMENTS
    ======================================================== */

    const animationStage =
        byId(
            "storageAnimationStage"
        );


    const tableCard =
        byId(
            "storageProductTableCard"
        );


    const tableBody =
        byId(
            "storageProductTableBody"
        );


    const tableMessage =
        byId(
            "storageTableSelectionMessage"
        );


    const categoryTitle =
        byId(
            "storageCategoryTitle"
        );


    const categorySubtitle =
        byId(
            "storageCategorySubtitle"
        );


    const productCount =
        byId(
            "storageVisibleProductCount"
        );


    const selectedSummary =
        byId(
            "storageSelectedSummary"
        );


    const selectedSummaryImage =
        byId(
            "storageSelectedSummaryImage"
        );


    const selectedSummaryFallback =
        byId(
            "storageSelectedSummaryFallback"
        );


    const previousArrow =
        byId(
            "warehousePreviousArrow"
        );


    const nextArrow =
        byId(
            "warehouseNextArrow"
        );


    const firstButton =
        byId(
            "firstStorageButton"
        );


    const previousButton =
        byId(
            "previousStorageButton"
        );


    const nextButton =
        byId(
            "nextStorageButton"
        );


    const lastButton =
        byId(
            "lastStorageButton"
        );


    const allStorageButton =
        byId(
            "backToAllStorageButton"
        );


    const focusButton =
        byId(
            "focusColumnButton"
        );


    const inspectButton =
        byId(
            "inspectBoxButton"
        );


    const viewProductsButton =
        byId(
            "storageViewProductsButton"
        );


    const backToWarehouseButton =
        byId(
            "storageBackToWarehouseButton"
        );


    const addCategoryButton =
        byId(
            "openStorageCategoryModalButton"
        );


    const manageCategoryButton =
        byId(
            "manageStorageCategoryButton"
        );


    const categoryModal =
        byId(
            "storageAddCategoryModal"
        );


    const categoryForm =
        byId(
            "storageAddCategoryForm"
        );


    const categoryNameInput =
        byId(
            "newStorageCategoryName"
        );


    const categoryProductInput =
        byId(
            "newStorageProductType"
        );


    const addProductTypeButton =
        byId(
            "addStorageProductType"
        );


    const categoryProductList =
        byId(
            "storageProductTypeList"
        );


    const categoryError =
        byId(
            "storageCategoryModalError"
        );


    const categoryModalTitle =
        byId(
            "storageAddCategoryTitle"
        );


    const categorySaveButton =
        byId(
            "createStorageCategory"
        );


    const categoryCancelButton =
        byId(
            "cancelStorageCategory"
        );


    const categoryCloseButton =
        byId(
            "closeStorageCategoryModal"
        );


    const deleteCategorySlot =
        byId(
            "storageDeleteCategorySlot"
        );


    /* ========================================================
       LOAD CATEGORY MASTER
    ======================================================== */

    async function loadCategoriesFromBackend() {

        categoryRecords = [];
        categoryProductTypes = {};
        categoryMeta = {};

        const seenByCategory = {};

        databaseProducts.forEach(function (product) {
            const category = normalize(product.category || "OPEN RACK");
            const productId = safeText(product.product_id);

            if (!category || !productId) return;

            if (!categoryProductTypes[category]) {
                categoryProductTypes[category] = [];
                seenByCategory[category] = new Set();
            }

            if (!seenByCategory[category].has(productId)) {
                seenByCategory[category].add(productId);
                categoryProductTypes[category].push(productId);
            }
        });

        categoryNames = Object.keys(categoryProductTypes);

        categoryRecords = categoryNames.map(function (category, index) {
            return {
                id: index + 1,
                category: category,
                productTypes: categoryProductTypes[category],
                isDefault: false
            };
        });

        categoryNames.forEach(function (category, index) {
            categoryMeta[category] = {
                id: index + 1,
                isDefault: false,
                productCount: categoryProductTypes[category].length
            };
        });

        if (categoryNames.length === 0) {
            throw new Error(
                "Open Rack Master has 0 products. Attach the Open Rack Master Excel."
            );
        }
    }


    /* ========================================================
       MATCH REGISTERED PRODUCT
    ======================================================== */

    function findRegisteredProduct(
        category,
        productType
    ) {

        const categoryNormal =
            normalize(
                category
            );


        const productNormal =
            normalize(
                productType
            );


        const productLoose =
            normalizeLoose(
                productType
            );


        let product =
            databaseProducts.find(
                function (item) {
                    return (
                        normalize(item.category) === categoryNormal &&
                        normalize(item.product_id) === productNormal
                    );
                }
            );

        if (product) {
            return product;
        }


        product =
            databaseProducts.find(
                function (item) {

                    return (
                        normalize(
                            item.category
                        ) ===
                            categoryNormal &&
                        normalize(
                            item.product_name
                        ) ===
                            productNormal
                    );
                }
            );


        if (product) {

            return product;
        }


        product =
            databaseProducts.find(
                function (item) {

                    return (
                        normalize(
                            item.category
                        ) ===
                            categoryNormal &&
                        normalizeLoose(
                            item.product_name
                        ) ===
                            productLoose
                    );
                }
            );


        return (
            product ||
            null
        );
    }


    /* ========================================================
       BUILD PRODUCT RECORD
    ======================================================== */

    function buildProductRecord(
        category,
        productType,
        index
    ) {

        const realProduct =
            findRegisteredProduct(
                category,
                productType
            );


        const masterId =
            buildMasterProductId(
                category,
                index
            );


        const storagePosition =
            buildStoragePosition(
                category
            );


        if (realProduct) {

            return {

                source:
                    "stock",

                hasStockRecord:
                    true,

                product:
                    realProduct,

                productType:
                    productType,

                productName:
                    safeText(
                        realProduct.product_name,
                        productType
                    ),

                productId:
                    safeText(
                        realProduct.product_id,
                        masterId
                    ),

                brand:
                    safeText(
                        realProduct.brand,
                        "Not assigned"
                    ),

                model:
                    safeText(
                        realProduct.model,
                        "Not assigned"
                    ),

                category:
                    safeText(
                        realProduct.category,
                        category
                    ),

                location:
                    safeText(
                        realProduct.location,
                        "Category Storage"
                    ),

                stock:
                    numberValue(
                        realProduct.current_quantity
                    ),

                unit:
                    safeText(
                        realProduct.unit,
                        "Nos"
                    ),

                storageColumn:
                    storagePosition,

                imageUrl:
                    safeText(
                        realProduct.image_url,
                        ""
                    ),

                status:
                    "Stock Registered"
            };
        }


        return {

            source:
                "master",

            hasStockRecord:
                false,

            product:
                null,

            productType:
                productType,

            productName:
                productType,

            productId:
                masterId,

            brand:
                "Not assigned",

            model:
                "Not assigned",

            category:
                category,

            location:
                "Category Storage",

            stock:
                0,

            unit:
                "Nos",

            storageColumn:
                storagePosition,

            imageUrl:
                "",

            status:
                "Product Master"
        };
    }


    function buildCategoryRows(
        category
    ) {

        const types =
            categoryProductTypes[
                category
            ] ||
            [];


        return types.map(
            function (
                productType,
                index
            ) {

                return buildProductRecord(
                    category,
                    productType,
                    index
                );
            }
        );
    }


    /* ========================================================
       CATEGORY HEADING
    ======================================================== */

    function updateCategoryHeading(
        category
    ) {

        if (!category) {

            if (categoryTitle) {

                categoryTitle.textContent =
                    "Select a Category";
            }


            if (categorySubtitle) {

                categorySubtitle.textContent =
                    "Select a storage cabinet above.";
            }


            if (productCount) {

                productCount.textContent =
                    "0 Products";
            }


            return;
        }


        const count =
            (
                categoryProductTypes[
                    category
                ] ||
                []
            ).length;


        if (categoryTitle) {

            categoryTitle.textContent =
                category;
        }


        if (categorySubtitle) {

            categorySubtitle.textContent =
                (
                    count +
                    " " +
                    (
                        count === 1
                            ? "product type"
                            : "product types"
                    ) +
                    " in this storage category."
                );
        }


        if (productCount) {

            productCount.textContent =
                (
                    count +
                    (
                        count === 1
                            ? " Product"
                            : " Products"
                    )
                );
        }
    }


    /* ========================================================
       PRODUCT IMAGE HTML
    ======================================================== */

    function productImageHtml(
        record
    ) {

        const productName =
            safeText(
                record && record.productName,
                "Product"
            );

        const brand =
            safeText(
                record && record.brand,
                ""
            );

        const model =
            safeText(
                record && record.model,
                ""
            );

        const imageUrl =
            safeText(
                record && record.imageUrl,
                ""
            ) ||
            getProductImageUrl(
                productName
            );

        return `
            <div class="storage-table-dp auto-product-image-frame">
                <img
                    data-auto-product-image
                    data-product-name="${escapeHtml(productName)}"
                    data-product-brand="${escapeHtml(brand === "Not assigned" ? "" : brand)}"
                    data-product-model="${escapeHtml(model === "Not assigned" ? "" : model)}"
                    ${imageUrl ? `src="${escapeHtml(imageUrl)}"` : ""}
                    alt="${escapeHtml(productName)}"
                    loading="lazy"
                >
                <span class="auto-product-fallback">📦</span>
            </div>
        `;
    }


    /* ========================================================
       RENDER TABLE
    ======================================================== */

    function renderCategoryTable(
        category
    ) {

        category =
            normalize(
                category
            );


        if (
            !categoryProductTypes[
                category
            ]
        ) {

            return;
        }


        selectedCategory =
            category;


        navigationIndex =
            Math.max(
                0,
                categoryNames.indexOf(
                    category
                )
            );


        updateCategoryHeading(
            category
        );


        currentTableRows =
            buildCategoryRows(
                category
            );


        if (!tableBody) {

            return;
        }


        tableBody.innerHTML =
            "";


        if (
            currentTableRows.length ===
            0
        ) {

            tableBody.innerHTML = `
                <tr>

                    <td
                        colspan="10"
                        style="
                            padding:48px 20px;
                            text-align:center;
                            color:#71879b;
                            font-weight:800;
                        "
                    >
                        No product types configured for this category.
                    </td>

                </tr>
            `;


            updateNavigationButtons();

            return;
        }


        const fragment =
            document.createDocumentFragment();


        currentTableRows.forEach(
            function (
                record,
                index
            ) {

                const row =
                    document.createElement(
                        "tr"
                    );


                row.className =
                    "storage-product-row";


                row.dataset.productId =
                    record.productId;


                row.dataset.productType =
                    record.productType;


                row.dataset.storageCategory =
                    category;


                row.innerHTML = `

                    <td>
                        <strong>
                            ${index + 1}
                        </strong>
                    </td>


                    <td>
                        ${productImageHtml(record)}
                    </td>


                    <td>

                        <div class="storage-product-name">

                            <strong>
                                ${escapeHtml(record.productName)}
                            </strong>

                            <small>
                                ${
                                    record.hasStockRecord
                                        ? "Stock Registered"
                                        : "Product Master · First inward available"
                                }
                            </small>

                        </div>

                    </td>


                    <td>

                        <strong
                            style="
                                color:#145fc5;
                                font-weight:950;
                            "
                        >
                            ${escapeHtml(record.productId)}
                        </strong>

                    </td>


                    <td>

                        <strong>
                            ${
                                record.hasStockRecord
                                    ? "Registered Product"
                                    : escapeHtml(record.brand)
                            }
                        </strong>

                        <br>

                        <small>
                            ${
                                record.hasStockRecord
                                    ? (
                                        escapeHtml(record.brand) +
                                        (
                                            record.model !== "Not assigned"
                                                ? " · " + escapeHtml(record.model)
                                                : ""
                                        )
                                    )
                                    : "Pending Stock Registration"
                            }
                        </small>

                    </td>


                    <td>
                        ${escapeHtml(record.category)}
                    </td>


                    <td>
                        ${escapeHtml(record.location)}
                    </td>


                    <td>

                        <span class="storage-stock-pill">

                            ${formatNumber(record.stock)}
                            ${escapeHtml(record.unit)}

                        </span>

                    </td>


                    <td>
                        ${escapeHtml(record.unit)}
                    </td>


                    <td>

                        <span class="storage-column-pill">

                            ${escapeHtml(record.storageColumn)}

                        </span>

                    </td>

                `;


                fragment.appendChild(
                    row
                );
            }
        );


        tableBody.appendChild(
            fragment
        );


        if (
            window.ProductImages &&
            typeof window.ProductImages.hydrate === "function"
        ) {
            window.ProductImages.hydrate(
                tableBody
            );
        }


        const registered =
            currentTableRows.filter(
                function (record) {

                    return record.hasStockRecord;
                }
            ).length;


        const masterOnly =
            currentTableRows.length -
            registered;


        if (tableMessage) {

            tableMessage.innerHTML = `

                <span class="storage-table-selection-dot"></span>

                <span>

                    <strong>
                        ${escapeHtml(category)}
                    </strong>

                    · ${currentTableRows.length} product types

                    · ${registered} stock registered

                    · ${masterOnly} master only

                </span>
            `;
        }


        clearSelectedProduct();

        updateNavigationButtons();
    }


    /* ========================================================
       PRODUCT DETAILS
    ======================================================== */

    function clearRowHighlight() {

        if (!tableBody) {

            return;
        }


        tableBody
            .querySelectorAll(
                ".storage-product-row"
            )
            .forEach(
                function (row) {

                    row.classList.remove(
                        "storage-row-selected"
                    );
                }
            );
    }


    function highlightRow(row) {

        clearRowHighlight();


        if (row) {

            row.classList.add(
                "storage-row-selected"
            );
        }
    }


    function clearSelectedProduct() {

        selectedDisplayRecord =
            null;


        selectedProductRecord =
            null;


        if (selectedSummary) {

            selectedSummary.classList.remove(
                "active"
            );
        }
    }


    function updateSelectedProductDetails(
        record
    ) {

        if (!record) {

            return;
        }


        if (selectedSummary) {

            selectedSummary.classList.add(
                "active"
            );
        }


        setText(
            "storageSelectedSummaryName",
            record.productName
        );


        setText(
            "storageSelectedSummaryMeta",
            record.hasStockRecord
                ? (
                    "Registered Product · " +
                    record.productId +
                    " · Stock Registered"
                )
                : (
                    "Product Master · " +
                    record.productId +
                    " · First inward available"
                )
        );


        setText(
            "storageSelectedDetailId",
            record.productId
        );


        setText(
            "storageSelectedDetailCategory",
            record.category
        );


        setText(
            "storageSelectedDetailBrand",
            record.brand
        );


        setText(
            "storageSelectedDetailModel",
            record.model
        );


        setText(
            "storageSelectedDetailLocation",
            record.location
        );


        setText(
            "storageSelectedDetailUnit",
            record.unit
        );


        setText(
            "storageSelectedDetailStock",
            (
                formatNumber(
                    record.stock
                ) +
                " " +
                record.unit
            )
        );


        setText(
            "storageSelectedDetailStatus",
            record.hasStockRecord
                ? "Stock Registered"
                : "Pending Stock Registration"
        );


        setText(
            "storageSelectedSummaryColumn",
            record.storageColumn
        );


        if (
            selectedSummaryImage &&
            selectedSummaryFallback
        ) {

            const knownImageUrl =
                safeText(
                    record.imageUrl,
                    ""
                ) ||
                getProductImageUrl(
                    record.productName
                );

            const showSummaryImage =
                function (imageUrl) {
                    if (!imageUrl) {
                        selectedSummaryImage.removeAttribute("src");
                        selectedSummaryImage.style.display = "none";
                        selectedSummaryFallback.style.display = "grid";
                        return;
                    }

                    selectedSummaryImage.onload = function () {
                        selectedSummaryImage.style.display = "block";
                        selectedSummaryFallback.style.display = "none";
                    };
                    selectedSummaryImage.onerror = function () {
                        selectedSummaryImage.style.display = "none";
                        selectedSummaryFallback.style.display = "grid";
                    };
                    selectedSummaryImage.src = imageUrl;
                };

            showSummaryImage(
                knownImageUrl
            );

            if (
                !knownImageUrl &&
                window.ProductImages &&
                typeof window.ProductImages.resolve === "function"
            ) {
                window.ProductImages.resolve(
                    record.productName,
                    record.brand === "Not assigned" ? "" : record.brand,
                    record.model === "Not assigned" ? "" : record.model
                ).then(
                    showSummaryImage
                );
            }
        }


        /* --------------------------------------------------------
           ONLINE PRODUCT SOURCE / STATUS
           Uses the same cached enrichment as Current Stock.
        -------------------------------------------------------- */

        if (
            selectedSummary &&
            window.ProductImages &&
            typeof window.ProductImages.resolveInfo === "function"
        ) {
            const sourceStatus = byId("storageSelectedLinkStatus");
            const pageStatus = byId("storageSelectedPageStatus");
            const sourceLink = byId("storageSelectedProductLink");
            const matchScore = byId("storageSelectedMatchScore");

            if (sourceStatus) {
                sourceStatus.textContent = "Checking source…";
                sourceStatus.className = "product-link-status pending";
            }
            if (pageStatus) {
                pageStatus.textContent = "Checking…";
                pageStatus.className = "product-page-status unknown";
            }
            if (sourceLink) {
                sourceLink.hidden = true;
                sourceLink.removeAttribute("href");
            }
            if (matchScore) {
                matchScore.hidden = true;
                matchScore.textContent = "";
            }

            window.ProductImages.resolveInfo(
                record.productName,
                record.brand === "Not assigned" ? "" : record.brand,
                record.model === "Not assigned" ? "" : record.model,
                safeText(record.imageUrl, "") || getProductImageUrl(record.productName)
            ).then(function (info) {
                window.ProductImages.applyInfoToScope(selectedSummary, info);
            });
        }
    }


    async function selectProductRecord(
        record,
        row
    ) {

        if (!record) {

            return;
        }


        selectedDisplayRecord =
            record;


        selectedProductRecord =
            record.product;


        highlightRow(
            row
        );


        updateSelectedProductDetails(
            record
        );


        showMessage(
            (
                record.productName +
                " selected."
            ),
            "success"
        );


        await delay(
            100
        );


        smoothScrollTo(
            selectedSummary,
            "start"
        );
    }


    if (tableBody) {

        tableBody.addEventListener(
            "click",
            async function (event) {

                const row =
                    event.target.closest(
                        ".storage-product-row"
                    );


                if (!row) {

                    return;
                }


                const id =
                    row.dataset.productId;


                const record =
                    currentTableRows.find(
                        function (item) {

                            return (
                                item.productId ===
                                id
                            );
                        }
                    );


                if (!record) {

                    return;
                }


                await selectProductRecord(
                    record,
                    row
                );
            }
        );
    }


    /* ========================================================
       BUILD 3D CATEGORY ARRAY
    ======================================================== */

    function build3DCategories() {

        return categoryNames.map(
            function (category) {

                return {

                    category:
                        category,

                    productTypes:
                        (
                            categoryProductTypes[
                                category
                            ] ||
                            []
                        ).slice()
                };
            }
        );
    }


    /* ========================================================
       BUILD 3D WAREHOUSE
    ======================================================== */

    async function rebuild3DWarehouse() {

        const stock3DReady =
            await waitForStock3D();


        if (!stock3DReady) {

            throw new Error(
                "3D storage engine did not load."
            );
        }


        const records =
            build3DCategories();


        console.log(
            "Building 3D cabinets:",
            records.length,
            records
        );


        window.Stock3D
            .prepareCategoryWarehouse(
                {
                    categories:
                        records
                }
            );


        if (
            typeof window.Stock3D
                .resize ===
                "function"
        ) {

            window.Stock3D.resize();
        }


        /*
           Give Three.js one frame to finish building.
        */

        await delay(
            150
        );
    }


    /* ========================================================
       SELECT CATEGORY WITHOUT SCROLLING
    ======================================================== */

    async function activateCategory(
        category,
        options = {}
    ) {

        category =
            normalize(
                category
            );


        if (
            !category ||
            !categoryNames.includes(
                category
            )
        ) {

            return;
        }


        selectedCategory =
            category;


        navigationIndex =
            categoryNames.indexOf(
                category
            );


        /*
           TABLE ALWAYS SYNCHRONIZED.
        */

        renderCategoryTable(
            category
        );


        setStageStatus(
            category
        );


        updateNavigationButtons();


        if (
            window.Stock3D &&
            typeof window.Stock3D
                .selectCategory ===
                "function"
        ) {

            window.Stock3D.selectCategory(
                category
            );
        }


        if (focusButton) {

            focusButton.disabled =
                false;
        }


        if (inspectButton) {

            inspectButton.disabled =
                false;
        }


        if (
            options.openCabinet
        ) {

            await openCurrentCabinet();
        }
    }


    /* ========================================================
       OPEN CABINET
    ======================================================== */

    async function openCurrentCabinet() {

        if (
            openingCabinet ||
            !selectedCategory
        ) {

            return;
        }


        openingCabinet =
            true;


        try {

            if (
                window.Stock3D &&
                typeof window.Stock3D
                    .selectCategory ===
                    "function"
            ) {

                window.Stock3D
                    .selectCategory(
                        selectedCategory
                    );
            }


            if (
                window.Stock3D &&
                typeof window.Stock3D
                    .openCategoryCabinet ===
                    "function"
            ) {

                await window.Stock3D
                    .openCategoryCabinet(
                        selectedCategory
                    );

            } else if (
                window.Stock3D &&
                typeof window.Stock3D
                    .inspectSelectedCategory ===
                    "function"
            ) {

                await window.Stock3D
                    .inspectSelectedCategory();
            }


            showMessage(
                (
                    selectedCategory +
                    " cabinet opened. " +
                    "Use View Category Products when you want the table."
                ),
                "success"
            );


        } catch (error) {

            console.error(
                "Unable to open cabinet:",
                error
            );


            showMessage(
                "Unable to open the selected cabinet.",
                "error"
            );


        } finally {

            openingCabinet =
                false;
        }
    }


    /* ========================================================
       SYNCHRONIZED NAVIGATION
    ======================================================== */

    async function navigateToIndex(
        targetIndex
    ) {

        if (
            navigationBusy ||
            categoryNames.length ===
                0
        ) {

            return;
        }


        targetIndex =
            Math.max(
                0,
                Math.min(
                    targetIndex,
                    categoryNames.length -
                    1
                )
            );


        navigationBusy =
            true;


        try {

            navigationIndex =
                targetIndex;


            const category =
                categoryNames[
                    navigationIndex
                ];


            /*
               MOVE 3D CABINET.
            */

            if (
                window.Stock3D &&
                typeof window.Stock3D
                    .moveToCategoryIndex ===
                    "function"
            ) {

                await window.Stock3D
                    .moveToCategoryIndex(
                        navigationIndex,
                        true
                    );
            }


            /*
               TABLE SWITCHES TO SAME CATEGORY.
            */

            await activateCategory(
                category,
                {
                    openCabinet:
                        false
                }
            );


            showMessage(
                (
                    category +
                    " loaded."
                ),
                "success"
            );


        } catch (error) {

            console.error(
                "Storage navigation error:",
                error
            );


            showMessage(
                "Unable to navigate storage.",
                "error"
            );


        } finally {

            navigationBusy =
                false;
        }
    }


    /* ========================================================
       NAV BUTTON STATES
    ======================================================== */

    function updateNavigationButtons() {

        const noCategories =
            categoryNames.length ===
            0;


        const atFirst =
            navigationIndex <=
            0;


        const atLast =
            navigationIndex >=
            categoryNames.length -
            1;


        if (firstButton) {

            firstButton.disabled =
                noCategories ||
                atFirst;
        }


        if (previousButton) {

            previousButton.disabled =
                noCategories ||
                atFirst;
        }


        if (previousArrow) {

            previousArrow.disabled =
                noCategories ||
                atFirst;


            previousArrow.style.opacity =
                previousArrow.disabled
                    ? "0.35"
                    : "1";
        }


        if (nextButton) {

            nextButton.disabled =
                noCategories ||
                atLast;
        }


        if (lastButton) {

            lastButton.disabled =
                noCategories ||
                atLast;
        }


        if (nextArrow) {

            nextArrow.disabled =
                noCategories ||
                atLast;


            nextArrow.style.opacity =
                nextArrow.disabled
                    ? "0.35"
                    : "1";
        }
    }


    /* ========================================================
       NAV EVENTS
    ======================================================== */

    if (firstButton) {

        firstButton.addEventListener(
            "click",
            function () {

                navigateToIndex(
                    0
                );
            }
        );
    }


    if (previousButton) {

        previousButton.addEventListener(
            "click",
            function () {

                navigateToIndex(
                    navigationIndex -
                    1
                );
            }
        );
    }


    if (nextButton) {

        nextButton.addEventListener(
            "click",
            function () {

                navigateToIndex(
                    navigationIndex +
                    1
                );
            }
        );
    }


    if (lastButton) {

        lastButton.addEventListener(
            "click",
            function () {

                navigateToIndex(
                    categoryNames.length -
                    1
                );
            }
        );
    }


    if (previousArrow) {

        previousArrow.addEventListener(
            "click",
            function () {

                navigateToIndex(
                    navigationIndex -
                    1
                );
            }
        );
    }


    if (nextArrow) {

        nextArrow.addEventListener(
            "click",
            function () {

                navigateToIndex(
                    navigationIndex +
                    1
                );
            }
        );
    }


    /* ========================================================
       ALL STORAGE
    ======================================================== */

    if (allStorageButton) {

        allStorageButton.addEventListener(
            "click",
            async function () {

                if (
                    categoryNames.length ===
                    0
                ) {

                    return;
                }


                await navigateToIndex(
                    0
                );


                setStageStatus(
                    categoryNames[
                        0
                    ]
                );


                smoothScrollTo(
                    animationStage,
                    "start"
                );
            }
        );
    }


    /* ========================================================
       VIEW PRODUCTS
    ======================================================== */

    if (viewProductsButton) {

        viewProductsButton.addEventListener(
            "click",
            function () {

                if (!selectedCategory) {

                    showMessage(
                        "Select a cabinet first.",
                        "error"
                    );

                    return;
                }


                renderCategoryTable(
                    selectedCategory
                );


                smoothScrollTo(
                    tableCard,
                    "start"
                );
            }
        );
    }


    /* ========================================================
       UP ARROW
    ======================================================== */

    if (backToWarehouseButton) {

        backToWarehouseButton.addEventListener(
            "click",
            function () {

                if (!animationStage) {

                    return;
                }


                smoothScrollTo(
                    animationStage,
                    "start"
                );


                window.setTimeout(
                    function () {

                        if (
                            selectedCategory &&
                            window.Stock3D &&
                            typeof window.Stock3D
                                .selectCategory ===
                                "function"
                        ) {

                            window.Stock3D
                                .selectCategory(
                                    selectedCategory
                                );
                        }

                    },
                    500
                );
            }
        );
    }


    /* ========================================================
       FOCUS
    ======================================================== */

    if (focusButton) {

        focusButton.addEventListener(
            "click",
            async function () {

                if (!selectedCategory) {

                    return;
                }


                if (
                    window.Stock3D &&
                    typeof window.Stock3D
                        .selectCategory ===
                        "function"
                ) {

                    window.Stock3D
                        .selectCategory(
                            selectedCategory
                        );
                }


                if (
                    window.Stock3D &&
                    typeof window.Stock3D
                        .focusSelectedCategory ===
                        "function"
                ) {

                    await window.Stock3D
                        .focusSelectedCategory();
                }
            }
        );
    }


    /* ========================================================
       INSPECT
    ======================================================== */

    if (inspectButton) {

        inspectButton.addEventListener(
            "click",
            async function () {

                await openCurrentCabinet();
            }
        );
    }


    /* ========================================================
       CABINET CLICK CALLBACK
    ======================================================== */

    function configure3DClickHandler() {

        if (
            !window.Stock3D ||
            typeof window.Stock3D
                .setCategoryClickHandler !==
                "function"
        ) {

            return;
        }


        window.Stock3D
            .setCategoryClickHandler(
                async function (details) {

                    const category =
                        normalize(
                            details &&
                            details.category
                        );


                    if (
                        !category ||
                        !categoryNames.includes(
                            category
                        )
                    ) {

                        return;
                    }


                    /*
                       SELECT SAME CATEGORY IN TABLE,
                       BUT DO NOT SCROLL.
                    */

                    await activateCategory(
                        category,
                        {
                            openCabinet:
                                false
                        }
                    );


                    /*
                       OPEN THE CABINET.
                    */

                    await openCurrentCabinet();
                }
            );
    }


    /* ========================================================
       CATEGORY MODAL
    ======================================================== */

    function clearCategoryError() {

        if (categoryError) {

            categoryError.textContent =
                "";
        }
    }


    function setCategoryError(message) {

        if (categoryError) {

            categoryError.textContent =
                message;
        }
    }


    function renderCategoryProductTypes() {

        if (!categoryProductList) {

            return;
        }


        categoryProductList.innerHTML =
            "";


        if (
            categoryModalProductTypes.length ===
            0
        ) {

            categoryProductList.innerHTML = `
                <span
                    style="
                        color:#8395a8;
                        font-size:8px;
                    "
                >
                    No product types added yet.
                </span>
            `;

            return;
        }


        categoryModalProductTypes.forEach(
            function (
                productType,
                index
            ) {

                const chip =
                    document.createElement(
                        "span"
                    );


                chip.style.cssText = `
                    display:inline-flex;
                    align-items:center;
                    gap:7px;
                    padding:7px 9px;
                    border:1px solid #c9dcf2;
                    border-radius:999px;
                    background:#eff6ff;
                    color:#255b9e;
                    font-size:8px;
                    font-weight:850;
                `;


                chip.innerHTML = `

                    ${escapeHtml(productType)}

                    <button
                        type="button"
                        data-remove-product-type="${index}"
                        style="
                            border:0;
                            background:none;
                            color:#c33;
                            cursor:pointer;
                            font-weight:950;
                        "
                    >
                        ×
                    </button>

                `;


                categoryProductList.appendChild(
                    chip
                );
            }
        );
    }


    if (categoryProductList) {

        categoryProductList.addEventListener(
            "click",
            function (event) {

                const button =
                    event.target.closest(
                        "[data-remove-product-type]"
                    );


                if (!button) {

                    return;
                }


                const index =
                    Number(
                        button.dataset
                            .removeProductType
                    );


                if (
                    Number.isInteger(
                        index
                    )
                ) {

                    categoryModalProductTypes.splice(
                        index,
                        1
                    );


                    renderCategoryProductTypes();
                }
            }
        );
    }


    function addProductTypeToModal() {

        const value =
            safeText(
                categoryProductInput
                    ? categoryProductInput.value
                    : ""
            );


        if (!value) {

            return;
        }


        const exists =
            categoryModalProductTypes
                .some(
                    function (item) {

                        return (
                            normalize(
                                item
                            ) ===
                            normalize(
                                value
                            )
                        );
                    }
                );


        if (!exists) {

            categoryModalProductTypes.push(
                value
            );
        }


        if (categoryProductInput) {

            categoryProductInput.value =
                "";


            categoryProductInput.focus();
        }


        renderCategoryProductTypes();
    }


    if (addProductTypeButton) {

        addProductTypeButton.addEventListener(
            "click",
            addProductTypeToModal
        );
    }


    if (categoryProductInput) {

        categoryProductInput.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key ===
                    "Enter"
                ) {

                    event.preventDefault();

                    addProductTypeToModal();
                }
            }
        );
    }


    /* ========================================================
       DELETE BUTTON
    ======================================================== */

    function removeDeleteCategoryButton() {

        if (
            deleteCategoryButton &&
            deleteCategoryButton.parentNode
        ) {

            deleteCategoryButton.parentNode
                .removeChild(
                    deleteCategoryButton
                );
        }


        deleteCategoryButton =
            null;


        if (deleteCategorySlot) {

            deleteCategorySlot.innerHTML =
                "";
        }
    }


    function createDeleteCategoryButton() {

        removeDeleteCategoryButton();


        if (!deleteCategorySlot) {

            return;
        }


        const meta =
            categoryMeta[
                editingOriginalCategory
            ];


        if (
            meta &&
            meta.isDefault
        ) {

            return;
        }


        deleteCategoryButton =
            document.createElement(
                "button"
            );


        deleteCategoryButton.type =
            "button";


        deleteCategoryButton.className =
            "storage-category-delete";


        deleteCategoryButton.textContent =
            "Delete Category";


        deleteCategoryButton.addEventListener(
            "click",
            deleteCurrentCategory
        );


        deleteCategorySlot.appendChild(
            deleteCategoryButton
        );
    }


    /* ========================================================
       OPEN CREATE CATEGORY
    ======================================================== */

    function openCreateCategoryModal() {

        categoryModalMode =
            "create";


        editingOriginalCategory =
            null;


        categoryModalProductTypes =
            [];


        if (categoryNameInput) {

            categoryNameInput.value =
                "";
        }


        if (categoryProductInput) {

            categoryProductInput.value =
                "";
        }


        if (categoryModalTitle) {

            categoryModalTitle.textContent =
                "Add New Category";
        }


        if (categorySaveButton) {

            categorySaveButton.textContent =
                "＋ Create Category";
        }


        clearCategoryError();

        renderCategoryProductTypes();

        removeDeleteCategoryButton();


        if (categoryModal) {

            categoryModal.classList.remove(
                "hidden"
            );
        }
    }


    /* ========================================================
       EDIT CATEGORY
    ======================================================== */

    function openEditCategoryModal() {

        if (!selectedCategory) {

            showMessage(
                "Select a category first.",
                "error"
            );

            return;
        }


        categoryModalMode =
            "edit";


        editingOriginalCategory =
            selectedCategory;


        categoryModalProductTypes =
            (
                categoryProductTypes[
                    selectedCategory
                ] ||
                []
            ).slice();


        if (categoryNameInput) {

            categoryNameInput.value =
                selectedCategory;
        }


        if (categoryProductInput) {

            categoryProductInput.value =
                "";
        }


        if (categoryModalTitle) {

            categoryModalTitle.textContent =
                "Edit Category";
        }


        if (categorySaveButton) {

            categorySaveButton.textContent =
                "Save Changes";
        }


        clearCategoryError();

        renderCategoryProductTypes();

        createDeleteCategoryButton();


        if (categoryModal) {

            categoryModal.classList.remove(
                "hidden"
            );
        }
    }


    /* ========================================================
       CLOSE MODAL
    ======================================================== */

    function closeCategoryModal() {

        if (categoryModal) {

            categoryModal.classList.add(
                "hidden"
            );
        }


        clearCategoryError();
    }


    if (addCategoryButton) {

        addCategoryButton.addEventListener(
            "click",
            openCreateCategoryModal
        );
    }


    if (manageCategoryButton) {

        manageCategoryButton.addEventListener(
            "click",
            openEditCategoryModal
        );
    }


    if (categoryCancelButton) {

        categoryCancelButton.addEventListener(
            "click",
            closeCategoryModal
        );
    }


    if (categoryCloseButton) {

        categoryCloseButton.addEventListener(
            "click",
            closeCategoryModal
        );
    }


    /* ========================================================
       SAVE CATEGORY
    ======================================================== */

    if (categoryForm) {

        categoryForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                clearCategoryError();


                const categoryName =
                    normalize(
                        categoryNameInput
                            ? categoryNameInput.value
                            : ""
                    );


                if (!categoryName) {

                    setCategoryError(
                        "Category name is required."
                    );

                    return;
                }


                if (
                    categoryModalProductTypes.length ===
                    0
                ) {

                    setCategoryError(
                        "Add at least one product type."
                    );

                    return;
                }


                if (categorySaveButton) {

                    categorySaveButton.disabled =
                        true;


                    categorySaveButton.textContent =
                        "Saving...";
                }


                try {

                    let url =
                        "/api/storage-categories";


                    let method =
                        "POST";


                    if (
                        categoryModalMode ===
                        "edit"
                    ) {

                        url =
                            (
                                "/api/storage-categories/" +
                                encodeURIComponent(
                                    editingOriginalCategory
                                )
                            );


                        method =
                            "PUT";
                    }


                    const response =
                        await fetch(
                            url,
                            {
                                method:
                                    method,

                                headers: {

                                    "Content-Type":
                                        "application/json",

                                    "Accept":
                                        "application/json"
                                },

                                body:
                                    JSON.stringify(
                                        {
                                            category:
                                                categoryName,

                                            productTypes:
                                                categoryModalProductTypes
                                        }
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
                            "Unable to save category."
                        );
                    }


                    closeCategoryModal();


                    await reloadWarehouseAfterCategoryChange(
                        categoryName
                    );


                    showMessage(
                        categoryModalMode ===
                            "create"
                            ? "New storage category created."
                            : "Storage category updated.",
                        "success"
                    );


                } catch (error) {

                    setCategoryError(
                        error.message ||
                        "Unable to save category."
                    );


                } finally {

                    if (categorySaveButton) {

                        categorySaveButton.disabled =
                            false;


                        categorySaveButton.textContent =
                            categoryModalMode ===
                                "create"
                                ? "＋ Create Category"
                                : "Save Changes";
                    }
                }
            }
        );
    }


    /* ========================================================
       DELETE CATEGORY
    ======================================================== */

    async function deleteCurrentCategory() {

        if (!editingOriginalCategory) {

            return;
        }


        const confirmed =
            window.confirm(
                (
                    "Delete category \"" +
                    editingOriginalCategory +
                    "\"?"
                )
            );


        if (!confirmed) {

            return;
        }


        try {

            const response =
                await fetch(
                    (
                        "/api/storage-categories/" +
                        encodeURIComponent(
                            editingOriginalCategory
                        )
                    ),
                    {
                        method:
                            "DELETE",

                        headers: {
                            "Accept":
                                "application/json"
                        }
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
                    "Unable to delete category."
                );
            }


            closeCategoryModal();


            await reloadWarehouseAfterCategoryChange();


            showMessage(
                "Storage category deleted.",
                "success"
            );


        } catch (error) {

            setCategoryError(
                error.message ||
                "Unable to delete category."
            );
        }
    }


    /* ========================================================
       RELOAD WAREHOUSE
    ======================================================== */

    async function reloadWarehouseAfterCategoryChange(
        preferredCategory = null
    ) {

        await loadCategoriesFromBackend();


        await rebuild3DWarehouse();


        configure3DClickHandler();


        let targetCategory =
            normalize(
                preferredCategory
            );


        if (
            !targetCategory ||
            !categoryNames.includes(
                targetCategory
            )
        ) {

            targetCategory =
                categoryNames[
                    0
                ];
        }


        navigationIndex =
            categoryNames.indexOf(
                targetCategory
            );


        await window.Stock3D
            .moveToCategoryIndex(
                navigationIndex,
                false
            );


        await activateCategory(
            targetCategory,
            {
                openCabinet:
                    false
            }
        );
    }


    /* ========================================================
       ESCAPE
    ======================================================== */

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key ===
                    "Escape" &&
                categoryModal &&
                !categoryModal
                    .classList
                    .contains(
                        "hidden"
                    )
            ) {

                closeCategoryModal();
            }
        }
    );


    /* ========================================================
       INITIALIZE
       MAIN EMPTY-WAREHOUSE FIX
    ======================================================== */

    async function initialize() {

        if (initialized) {

            return;
        }


        initialized =
            true;


        try {

            setStageStatus(
                "LOADING STORAGE..."
            );


            showMessage(
                "Loading storage categories..."
            );


            /*
               1. Load category master FIRST.
            */

            await loadCategoriesFromBackend();


            /*
               2. Wait for stock_3d.js.
            */

            const stock3DReady =
                await waitForStock3D(
                    10000
                );


            if (!stock3DReady) {

                throw new Error(
                    "3D Storage engine did not become ready."
                );
            }


            /*
               3. Build ALL cabinets.
            */

            await rebuild3DWarehouse();


            /*
               4. Connect cabinet click handler.
            */

            configure3DClickHandler();


            /*
               5. Start with first real category.
            */

            const firstCategory =
                categoryNames[
                    0
                ];


            navigationIndex =
                0;


            selectedCategory =
                firstCategory;


            /*
               6. Move camera to first cabinet.
            */

            await window.Stock3D
                .moveToCategoryIndex(
                    0,
                    false
                );


            /*
               7. Select first cabinet.
            */

            if (
                typeof window.Stock3D
                    .selectCategory ===
                    "function"
            ) {

                window.Stock3D
                    .selectCategory(
                        firstCategory
                    );
            }


            /*
               8. Populate table immediately.
            */

            renderCategoryTable(
                firstCategory
            );


            /*
               9. Update top status.
            */

            setStageStatus(
                firstCategory
            );


            if (focusButton) {

                focusButton.disabled =
                    false;
            }


            if (inspectButton) {

                inspectButton.disabled =
                    false;
            }


            updateNavigationButtons();


            /*
               Resize again because some browsers report
               container dimensions late.
            */

            await delay(
                250
            );


            if (
                window.Stock3D &&
                typeof window.Stock3D
                    .resize ===
                    "function"
            ) {

                window.Stock3D.resize();
            }


            showMessage(
                (
                    firstCategory +
                    " ready. Click the cabinet to open and inspect it."
                ),
                "success"
            );


            console.log(
                "Storage View initialized successfully.",
                {
                    categories:
                        categoryNames.length,

                    selected:
                        firstCategory
                }
            );


        } catch (error) {

            console.error(
                "Storage View initialization failed:",
                error
            );


            initialized =
                false;


            setStageStatus(
                "STORAGE ERROR"
            );


            showMessage(
                (
                    error.message ||
                    "Unable to initialize Storage View."
                ),
                "error"
            );
        }
    }


    /* ========================================================
       START
    ======================================================== */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            function () {

                initialize();
            },
            {
                once:
                    true
            }
        );

    } else {

        initialize();
    }


})();