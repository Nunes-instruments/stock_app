/* ============================================================
   NUNES STOCK MANAGEMENT
   REALISTIC 3D STORAGE ENGINE
   stock_3d.js
   VERSION 21.1

   STORAGE VIEW
   ------------------------------------------------------------
   ✓ Full cabinet clickable
   ✓ Pointer cursor over whole cabinet
   ✓ Uniform realistic cabinet layout
   ✓ Clear category header
   ✓ Clear product count
   ✓ Physical cabinet door opening
   ✓ Large readable details panel inside cabinet
   ✓ Product names shown inside cabinet
   ✓ Close other cabinet before opening another
   ✓ Camera moves close for inspection
   ✓ Cabinet remains open for reading
   ✓ Automatic scroll to matching product table
   ✓ First / Previous / Next / Last compatible
   ✓ Focus compatible
   ✓ Inspect compatible
   ✓ openCategoryCabinet() public API
   ✓ BLUE WIREFRAME / DIAGONAL LINE REMOVED

   ADD STOCK
   ------------------------------------------------------------
   ✓ INWARD movement animation
   ✓ OUTWARD movement animation
   ✓ Slow visible product movement
   ✓ Door open / close
   ✓ Movement card
   ✓ Movement banner
============================================================ */


(function () {

    "use strict";


    /* ========================================================
       THREE CHECK
    ======================================================== */

    if (
        typeof THREE ===
        "undefined"
    ) {

        console.error(
            "Stock3D: THREE.js is not loaded."
        );


        window.Stock3D = {

            prepareCategoryWarehouse:
                function () {},

            setCategoryClickHandler:
                function () {},

            moveToCategoryIndex:
                async function () {},

            selectCategory:
                function () {},

            clearCategorySelection:
                function () {},

            focusSelectedCategory:
                async function () {},

            inspectSelectedCategory:
                async function () {},

            openCategoryCabinet:
                async function () {},

            closeSelectedCabinet:
                async function () {},

            animateStockMovement:
                async function () {},

            storeProduct:
                async function () {},

            resize:
                function () {}
        };


        return;
    }




    /* ========================================================
       BRANCH MODE GATE (V4.9)
       The existing animated/open rack is retained unchanged for
       the main branch. Other branches use the new shelf rack only.
    ======================================================== */

    const storageAppRoot =
        document.getElementById(
            "storageViewApp"
        );

    if (
        storageAppRoot &&
        storageAppRoot.dataset.activeBranch &&
        storageAppRoot.dataset.activeBranch !== "main"
    ) {
        window.Stock3D = {
            prepareCategoryWarehouse: function () {},
            setCategoryClickHandler: function () {},
            moveToCategoryIndex: async function () {},
            selectCategory: function () {},
            clearCategorySelection: function () {},
            focusSelectedCategory: async function () {},
            inspectSelectedCategory: async function () {},
            openCategoryCabinet: async function () {},
            closeSelectedCabinet: async function () {},
            animateStockMovement: async function () {},
            storeProduct: async function () {},
            resize: function () {},
            getSelectedCategory: function () { return ""; },
            getViewingIndex: function () { return 0; },
            getCategories: function () { return []; },
            isCabinetOpen: function () { return false; }
        };
        return;
    }


    /* ========================================================
       DOM
    ======================================================== */

    const canvas =
        document.getElementById(
            "stock3dCanvas"
        );


    const container =
        document.getElementById(
            "threeStorageContainer"
        );


    if (
        !canvas ||
        !container
    ) {

        console.error(
            "Stock3D: Canvas/container missing."
        );

        return;
    }


    /* ========================================================
       CONSTANTS
    ======================================================== */

    const CABINET_WIDTH =
        4.60;


    const CABINET_HEIGHT =
        7.25;


    const CABINET_DEPTH =
        2.20;


    const CABINET_GAP =
        0.42;


    const CABINET_Y =
        CABINET_HEIGHT /
        2;


    const DOOR_OPEN_ANGLE =
        -Math.PI *
        0.67;


    const CAMERA_BROWSE_Z =
        23.5;


    const INSPECTION_READ_TIME =
        2600;


    /* ========================================================
       MOVEMENT TIMING
    ======================================================== */

    const MOVEMENT_TIMING = {

        focus:
            1100,

        highlight:
            450,

        bannerPause:
            650,

        doorOpen:
            1200,

        doorOpenPause:
            600,

        productPause:
            800,

        productTravel:
            2400,

        resultPause:
            900,

        doorClose:
            1200,

        finalPause:
            450
    };


    /* ========================================================
       RENDERER
    ======================================================== */

    const renderer =
        new THREE.WebGLRenderer(
            {
                canvas:
                    canvas,

                antialias:
                    true,

                alpha:
                    false,

                powerPreference:
                    "high-performance"
            }
        );


    renderer.setPixelRatio(
        Math.min(
            window.devicePixelRatio ||
            1,
            2
        )
    );


    renderer.shadowMap.enabled =
        true;


    renderer.shadowMap.type =
        THREE.PCFSoftShadowMap;


    if (
        "outputEncoding"
        in renderer
    ) {

        renderer.outputEncoding =
            THREE.sRGBEncoding;
    }


    renderer.setClearColor(
        0x071421,
        1
    );


    /* ========================================================
       SCENE
    ======================================================== */

    const scene =
        new THREE.Scene();


    scene.background =
        new THREE.Color(
            0x071421
        );


    scene.fog =
        new THREE.Fog(
            0x071421,
            30,
            85
        );


    /* ========================================================
       CAMERA
    ======================================================== */

    const camera =
        new THREE.PerspectiveCamera(
            38,
            1,
            0.1,
            220
        );


    camera.position.set(
        0,
        5.25,
        CAMERA_BROWSE_Z
    );


    const cameraTarget =
        new THREE.Vector3(
            0,
            3.35,
            0
        );


    /* ========================================================
       GROUPS
    ======================================================== */

    const worldGroup =
        new THREE.Group();


    const cabinetGroup =
        new THREE.Group();


    const movementGroup =
        new THREE.Group();


    worldGroup.add(
        cabinetGroup
    );


    worldGroup.add(
        movementGroup
    );


    scene.add(
        worldGroup
    );


    /* ========================================================
       STATE
    ======================================================== */

    let categories =
        [];


    let cabinets =
        [];


    let selectedCategory =
        null;


    let selectedCabinet =
        null;


    let openedCabinet =
        null;


    let viewingIndex =
        0;


    let categoryClickHandler =
        null;


    let animationBusy =
        false;


    let cabinetInteractionBusy =
        false;


    let pointerDownCabinet =
        null;


    // V6.1: right-click + hold + drag pans Open Rack.
    let rightDragActive =
        false;

    let rightDragPointerId =
        null;

    let rightDragLastX =
        0;

    let rightDragLastY =
        0;


    let cameraTween =
        null;


    /* ========================================================
       RAYCAST
    ======================================================== */

    const raycaster =
        new THREE.Raycaster();


    const pointer =
        new THREE.Vector2();


    /* ========================================================
       HELPERS
    ======================================================== */

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


        return (
            text ||
            fallback
        );
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


    function clamp(
        value,
        min,
        max
    ) {

        return Math.max(
            min,
            Math.min(
                max,
                value
            )
        );
    }


    function lerp(
        start,
        end,
        t
    ) {

        return (
            start +
            (
                end -
                start
            ) *
            t
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


    function easeInOutCubic(t) {

        if (
            t <
            0.5
        ) {

            return (
                4 *
                t *
                t *
                t
            );
        }


        return (
            1 -
            Math.pow(
                -2 *
                t +
                2,
                3
            ) /
            2
        );
    }


    function easeOutCubic(t) {

        return (
            1 -
            Math.pow(
                1 -
                t,
                3
            )
        );
    }


    function animateValue(
        duration,
        update,
        easing = easeInOutCubic
    ) {

        return new Promise(
            function (resolve) {

                const startTime =
                    performance.now();


                function frame(now) {

                    const raw =
                        clamp(
                            (
                                now -
                                startTime
                            ) /
                            duration,
                            0,
                            1
                        );


                    update(
                        easing(
                            raw
                        ),
                        raw
                    );


                    if (
                        raw <
                        1
                    ) {

                        requestAnimationFrame(
                            frame
                        );

                    } else {

                        resolve();
                    }
                }


                requestAnimationFrame(
                    frame
                );
            }
        );
    }


    /* ========================================================
       PAGE SCROLL
    ======================================================== */

    function scrollToCategoryTable() {

        const table =
            document.getElementById(
                "storageProductTableCard"
            );


        if (!table) {

            return;
        }


        table.scrollIntoView(
            {
                behavior:
                    "smooth",

                block:
                    "start"
            }
        );
    }


    /* ========================================================
       MATERIALS
    ======================================================== */

    function makeStandardMaterial(
        color,
        options = {}
    ) {

        return new THREE.MeshStandardMaterial(
            {
                color:
                    color,

                roughness:
                    options.roughness ??
                    0.5,

                metalness:
                    options.metalness ??
                    0.15,

                transparent:
                    Boolean(
                        options.transparent
                    ),

                opacity:
                    options.opacity ??
                    1,

                emissive:
                    options.emissive ??
                    0x000000,

                emissiveIntensity:
                    options.emissiveIntensity ??
                    0
            }
        );
    }


    const MATERIALS = {

        body:
            makeStandardMaterial(
                0xe1e9f0,
                {
                    roughness:
                        0.38,

                    metalness:
                        0.26
                }
            ),

        side:
            makeStandardMaterial(
                0x9fafbd,
                {
                    roughness:
                        0.39,

                    metalness:
                        0.36
                }
            ),

        inside:
            makeStandardMaterial(
                0xf4f8fb,
                {
                    roughness:
                        0.54,

                    metalness:
                        0.05
                }
            ),

        frame:
            makeStandardMaterial(
                0x122d46,
                {
                    roughness:
                        0.30,

                    metalness:
                        0.65
                }
            ),

        shelf:
            makeStandardMaterial(
                0x69859e,
                {
                    roughness:
                        0.34,

                    metalness:
                        0.48
                }
            ),

        door:
            makeStandardMaterial(
                0xc9d7e4,
                {
                    roughness:
                        0.38,

                    metalness:
                        0.25
                }
            )
    };


    /* ========================================================
       BOX
    ======================================================== */

    function createBox(
        width,
        height,
        depth,
        material
    ) {

        const mesh =
            new THREE.Mesh(
                new THREE.BoxGeometry(
                    width,
                    height,
                    depth
                ),
                material
            );


        mesh.castShadow =
            true;


        mesh.receiveShadow =
            true;


        return mesh;
    }


    /* ========================================================
       CANVAS TEXTURE
    ======================================================== */

    function createTextTexture(
        options = {}
    ) {

        const width =
            options.width ||
            1200;


        const height =
            options.height ||
            400;


        const drawingCanvas =
            document.createElement(
                "canvas"
            );


        drawingCanvas.width =
            width;


        drawingCanvas.height =
            height;


        const ctx =
            drawingCanvas.getContext(
                "2d"
            );


        ctx.fillStyle =
            options.background ||
            "#ffffff";


        ctx.fillRect(
            0,
            0,
            width,
            height
        );


        if (
            options.border
        ) {

            ctx.strokeStyle =
                options.border;


            ctx.lineWidth =
                options.borderWidth ||
                8;


            ctx.strokeRect(
                5,
                5,
                width -
                10,
                height -
                10
            );
        }


        let y =
            options.startY ||
            65;


        (
            options.lines ||
            []
        ).forEach(
            function (line) {

                ctx.font =
                    (
                        line.weight ||
                        "700"
                    ) +
                    " " +
                    (
                        line.size ||
                        40
                    ) +
                    "px Arial";


                ctx.fillStyle =
                    line.color ||
                    "#153550";


                ctx.textAlign =
                    line.align ||
                    "center";


                ctx.textBaseline =
                    "middle";


                let text =
                    safeText(
                        line.text
                    );


                const maxWidth =
                    line.maxWidth ||
                    width -
                    70;


                while (
                    ctx.measureText(
                        text
                    ).width >
                        maxWidth &&
                    text.length >
                        7
                ) {

                    text =
                        text.slice(
                            0,
                            -2
                        );
                }


                if (
                    text !==
                    safeText(
                        line.text
                    )
                ) {

                    text +=
                        "…";
                }


                ctx.fillText(
                    text,
                    line.x ||
                    width /
                    2,
                    y
                );


                y +=
                    line.lineHeight ||
                    60;
            }
        );


        const texture =
            new THREE.CanvasTexture(
                drawingCanvas
            );


        texture.needsUpdate =
            true;


        if (
            "encoding"
            in texture
        ) {

            texture.encoding =
                THREE.sRGBEncoding;
        }


        return texture;
    }


    function createLabelPlane(
        width,
        height,
        texture,
        options = {}
    ) {

        const material =
            new THREE.MeshBasicMaterial(
                {
                    map:
                        texture,

                    transparent:
                        options.transparent ??
                        false,

                    side:
                        THREE.DoubleSide,

                    depthWrite:
                        options.depthWrite ??
                        false,

                    depthTest:
                        options.depthTest ??
                        true,

                    opacity:
                        options.opacity ??
                        1
                }
            );


        return new THREE.Mesh(
            new THREE.PlaneGeometry(
                width,
                height
            ),
            material
        );
    }


    /* ========================================================
       CLEAR INTERIOR DETAILS CARD
    ======================================================== */

    function createCabinetDetailsTexture(
        category,
        productTypes
    ) {

        const width =
            1600;


        const height =
            1800;


        const drawingCanvas =
            document.createElement(
                "canvas"
            );


        drawingCanvas.width =
            width;


        drawingCanvas.height =
            height;


        const ctx =
            drawingCanvas.getContext(
                "2d"
            );


        ctx.fillStyle =
            "#ffffff";


        ctx.fillRect(
            0,
            0,
            width,
            height
        );


        ctx.strokeStyle =
            "#347ac7";


        ctx.lineWidth =
            25;


        ctx.strokeRect(
            15,
            15,
            width -
            30,
            height -
            30
        );


        ctx.fillStyle =
            "#104c79";


        ctx.fillRect(
            15,
            15,
            width -
            30,
            255
        );


        ctx.textAlign =
            "center";


        ctx.textBaseline =
            "middle";


        ctx.fillStyle =
            "#d9edff";


        ctx.font =
            "900 42px Arial";


        ctx.fillText(
            "STORAGE CATEGORY",
            width /
            2,
            82
        );


        let categoryFont =
            67;


        ctx.font =
            "900 " +
            categoryFont +
            "px Arial";


        while (
            ctx.measureText(
                category
            ).width >
                width -
                130 &&
            categoryFont >
                36
        ) {

            categoryFont -=
                2;


            ctx.font =
                "900 " +
                categoryFont +
                "px Arial";
        }


        ctx.fillStyle =
            "#ffffff";


        ctx.fillText(
            category,
            width /
            2,
            178
        );


        ctx.fillStyle =
            "#eaf5ff";


        ctx.fillRect(
            75,
            315,
            width -
            150,
            120
        );


        ctx.fillStyle =
            "#1e67ad";


        ctx.font =
            "900 43px Arial";


        ctx.fillText(
            productTypes.length +
            (
                productTypes.length ===
                1
                    ? " PRODUCT TYPE"
                    : " PRODUCT TYPES"
            ),
            width /
            2,
            375
        );


        ctx.textAlign =
            "left";


        ctx.fillStyle =
            "#637d93";


        ctx.font =
            "900 34px Arial";


        ctx.fillText(
            "PRODUCTS STORED IN THIS CATEGORY",
            110,
            505
        );


        ctx.strokeStyle =
            "#bfd2e3";


        ctx.lineWidth =
            4;


        ctx.beginPath();


        ctx.moveTo(
            100,
            550
        );


        ctx.lineTo(
            width -
            100,
            550
        );


        ctx.stroke();


        const maxVisible =
            10;


        const list =
            productTypes.slice(
                0,
                maxVisible
            );


        let y =
            645;


        const rowHeight =
            102;


        list.forEach(
            function (
                product,
                index
            ) {

                if (
                    index %
                    2 ===
                    0
                ) {

                    ctx.fillStyle =
                        "#f2f7fc";


                    ctx.fillRect(
                        80,
                        y -
                        43,
                        width -
                        160,
                        86
                    );
                }


                ctx.fillStyle =
                    "#2f78ce";


                ctx.beginPath();


                ctx.arc(
                    135,
                    y,
                    31,
                    0,
                    Math.PI *
                    2
                );


                ctx.fill();


                ctx.fillStyle =
                    "#ffffff";


                ctx.textAlign =
                    "center";


                ctx.font =
                    "900 29px Arial";


                ctx.fillText(
                    String(
                        index +
                        1
                    ),
                    135,
                    y
                );


                let fontSize =
                    45;


                let productText =
                    safeText(
                        product
                    );


                ctx.font =
                    "800 " +
                    fontSize +
                    "px Arial";


                while (
                    ctx.measureText(
                        productText
                    ).width >
                        width -
                        330 &&
                    fontSize >
                        30
                ) {

                    fontSize -=
                        2;


                    ctx.font =
                        "800 " +
                        fontSize +
                        "px Arial";
                }


                while (
                    ctx.measureText(
                        productText
                    ).width >
                        width -
                        330 &&
                    productText.length >
                        10
                ) {

                    productText =
                        productText.slice(
                            0,
                            -2
                        );
                }


                if (
                    productText !==
                    safeText(
                        product
                    )
                ) {

                    productText +=
                        "…";
                }


                ctx.fillStyle =
                    "#102f4d";


                ctx.textAlign =
                    "left";


                ctx.fillText(
                    productText,
                    205,
                    y
                );


                y +=
                    rowHeight;
            }
        );


        if (
            productTypes.length >
            maxVisible
        ) {

            ctx.textAlign =
                "center";


            ctx.fillStyle =
                "#4f6f8d";


            ctx.font =
                "900 32px Arial";


            ctx.fillText(
                "+" +
                (
                    productTypes.length -
                    maxVisible
                ) +
                " MORE PRODUCTS",
                width /
                2,
                y +
                15
            );
        }


        ctx.fillStyle =
            "#eaf4fd";


        ctx.fillRect(
            80,
            height -
            185,
            width -
            160,
            105
        );


        ctx.fillStyle =
            "#245f99";


        ctx.textAlign =
            "center";


        ctx.font =
            "900 31px Arial";


        ctx.fillText(
            "FULL PRODUCT DETAILS AVAILABLE IN TABLE BELOW",
            width /
            2,
            height -
            132
        );


        const texture =
            new THREE.CanvasTexture(
                drawingCanvas
            );


        texture.needsUpdate =
            true;


        if (
            "encoding"
            in texture
        ) {

            texture.encoding =
                THREE.sRGBEncoding;
        }


        return texture;
    }


    /* ========================================================
       LIGHTING
    ======================================================== */

    const hemisphereLight =
        new THREE.HemisphereLight(
            0xecf7ff,
            0x15283a,
            1.85
        );


    scene.add(
        hemisphereLight
    );


    const mainLight =
        new THREE.DirectionalLight(
            0xffffff,
            2.2
        );


    mainLight.position.set(
        4,
        15,
        16
    );


    mainLight.castShadow =
        true;


    scene.add(
        mainLight
    );


    const sideLight =
        new THREE.DirectionalLight(
            0xa8d3ff,
            1.0
        );


    sideLight.position.set(
        -18,
        8,
        13
    );


    scene.add(
        sideLight
    );


    const frontLight =
        new THREE.PointLight(
            0xffffff,
            1.0,
            50
        );


    frontLight.position.set(
        0,
        6,
        19
    );


    scene.add(
        frontLight
    );


    /* ========================================================
       FLOOR
    ======================================================== */

    function buildFloor() {

        const floor =
            new THREE.Mesh(
                new THREE.PlaneGeometry(
                    120,
                    48
                ),

                makeStandardMaterial(
                    0x192b3e,
                    {
                        roughness:
                            0.8,

                        metalness:
                            0.08
                    }
                )
            );


        floor.rotation.x =
            -Math.PI /
            2;


        floor.position.y =
            0;


        floor.position.z =
            -2;


        floor.receiveShadow =
            true;


        scene.add(
            floor
        );


        const grid =
            new THREE.GridHelper(
                120,
                60,
                0x23689b,
                0x173c59
            );


        grid.position.y =
            0.015;


        grid.position.z =
            -2;


        if (
            Array.isArray(
                grid.material
            )
        ) {

            grid.material.forEach(
                function (material) {

                    material.transparent =
                        true;


                    material.opacity =
                        0.32;
                }
            );

        } else {

            grid.material.transparent =
                true;


            grid.material.opacity =
                0.32;
        }


        scene.add(
            grid
        );
    }


    buildFloor();


    /* ========================================================
       VENT
    ======================================================== */

    function createVent() {

        const group =
            new THREE.Group();


        const outer =
            new THREE.Mesh(
                new THREE.TorusGeometry(
                    0.53,
                    0.13,
                    16,
                    38
                ),

                makeStandardMaterial(
                    0x173751,
                    {
                        roughness:
                            0.22,

                        metalness:
                            0.78
                    }
                )
            );


        group.add(
            outer
        );


        const inner =
            new THREE.Mesh(
                new THREE.TorusGeometry(
                    0.31,
                    0.075,
                    14,
                    32
                ),

                makeStandardMaterial(
                    0x537d9d,
                    {
                        roughness:
                            0.27,

                        metalness:
                            0.68
                    }
                )
            );


        group.add(
            inner
        );


        for (
            let index = 0;
            index < 8;
            index += 1
        ) {

            const blade =
                createBox(
                    0.075,
                    0.52,
                    0.06,
                    MATERIALS.frame
                );


            blade.rotation.z =
                (
                    Math.PI /
                    4
                ) *
                index;


            group.add(
                blade
            );
        }


        return group;
    }


    /* ========================================================
       CREATE CABINET
    ======================================================== */

    function createCabinet(
        categoryRecord,
        index
    ) {

        const category =
            normalize(
                categoryRecord.category
            );


        const productTypes =
            Array.isArray(
                categoryRecord.productTypes
            )
                ? categoryRecord.productTypes
                    .slice()
                : [];


        const root =
            new THREE.Group();


        root.userData = {

            isStorageCabinet:
                true,

            category:
                category,

            index:
                index,

            productTypes:
                productTypes,

            doorOpen:
                false
        };


        /* BASE */

        const base =
            createBox(
                CABINET_WIDTH +
                0.22,
                0.35,
                CABINET_DEPTH +
                0.30,
                MATERIALS.side
            );


        base.position.y =
            0.18;


        root.add(
            base
        );


        const bottomTrim =
            createBox(
                CABINET_WIDTH +
                0.12,
                0.17,
                CABINET_DEPTH +
                0.14,
                MATERIALS.frame
            );


        bottomTrim.position.y =
            0.45;


        root.add(
            bottomTrim
        );


        /* BACK */

        const back =
            createBox(
                CABINET_WIDTH,
                CABINET_HEIGHT -
                0.45,
                0.23,
                MATERIALS.body
            );


        back.position.set(
            0,
            CABINET_Y,
            -CABINET_DEPTH /
            2 +
            0.10
        );


        root.add(
            back
        );


        /* SIDES */

        const sideWidth =
            0.29;


        const leftSide =
            createBox(
                sideWidth,
                CABINET_HEIGHT -
                0.45,
                CABINET_DEPTH,
                MATERIALS.side
            );


        leftSide.position.set(
            -CABINET_WIDTH /
            2 +
            sideWidth /
            2,
            CABINET_Y,
            0
        );


        root.add(
            leftSide
        );


        const rightSide =
            leftSide.clone();


        rightSide.position.x =
            CABINET_WIDTH /
            2 -
            sideWidth /
            2;


        root.add(
            rightSide
        );


        /* TOP */

        const top =
            createBox(
                CABINET_WIDTH,
                0.30,
                CABINET_DEPTH,
                MATERIALS.side
            );


        top.position.set(
            0,
            CABINET_HEIGHT -
            0.15,
            0
        );


        root.add(
            top
        );


        /* INNER BACK */

        const innerBack =
            createBox(
                CABINET_WIDTH -
                0.58,
                CABINET_HEIGHT -
                1.55,
                0.12,
                MATERIALS.inside
            );


        innerBack.position.set(
            0,
            3.28,
            -CABINET_DEPTH /
            2 +
            0.24
        );


        root.add(
            innerBack
        );


        /* CATEGORY HEADER */

        const headerTexture =
            createTextTexture(
                {
                    width:
                        1400,

                    height:
                        340,

                    background:
                        "#fbfdff",

                    border:
                        "#7d9db8",

                    borderWidth:
                        9,

                    startY:
                        105,

                    lines: [

                        {
                            text:
                                category,

                            size:
                                42,

                            weight:
                                "900",

                            color:
                                "#123451",

                            lineHeight:
                                83,

                            maxWidth:
                                1270
                        },

                        {
                            text:
                                productTypes.length +
                                (
                                    productTypes.length ===
                                    1
                                        ? " PRODUCT TYPE"
                                        : " PRODUCT TYPES"
                                ),

                            size:
                                27,

                            weight:
                                "900",

                            color:
                                "#667d91"
                        }
                    ]
                }
            );


        const header =
            createLabelPlane(
                CABINET_WIDTH -
                0.32,
                1.08,
                headerTexture
            );


        header.position.set(
            0,
            CABINET_HEIGHT -
            0.90,
            CABINET_DEPTH /
            2 +
            0.04
        );


        header.renderOrder =
            20;


        root.add(
            header
        );


        /* VENTS */

        const ventLeft =
            createVent();


        ventLeft.position.set(
            -0.88,
            5.35,
            CABINET_DEPTH /
            2 +
            0.10
        );


        root.add(
            ventLeft
        );


        const ventRight =
            createVent();


        ventRight.position.set(
            0.88,
            5.35,
            CABINET_DEPTH /
            2 +
            0.10
        );


        root.add(
            ventRight
        );


        /* PRODUCT COUNT */

        const countTexture =
            createTextTexture(
                {
                    width:
                        850,

                    height:
                        205,

                    background:
                        "#52b989",

                    startY:
                        103,

                    lines: [

                        {
                            text:
                                productTypes.length +
                                (
                                    productTypes.length ===
                                    1
                                        ? " PRODUCT TYPE"
                                        : " PRODUCT TYPES"
                                ),

                            size:
                                37,

                            weight:
                                "900",

                            color:
                                "#ffffff",

                            maxWidth:
                                770
                        }
                    ]
                }
            );


        const countBadge =
            createLabelPlane(
                2.65,
                0.58,
                countTexture
            );


        countBadge.position.set(
            0,
            4.52,
            CABINET_DEPTH /
            2 +
            0.10
        );


        root.add(
            countBadge
        );


        /* SHELVES */

        [
            1.25,
            2.48,
            3.80
        ].forEach(
            function (height) {

                const shelf =
                    createBox(
                        CABINET_WIDTH -
                        0.48,
                        0.09,
                        CABINET_DEPTH -
                        0.38,
                        MATERIALS.shelf
                    );


                shelf.position.set(
                    0,
                    height,
                    -0.05
                );


                root.add(
                    shelf
                );
            }
        );


        /* LARGE INTERNAL DETAILS */

        const detailsTexture =
            createCabinetDetailsTexture(
                category,
                productTypes
            );


        const detailsPanel =
            createLabelPlane(
                3.62,
                4.22,
                detailsTexture,
                {
                    depthWrite:
                        false
                }
            );


        detailsPanel.position.set(
            0,
            2.63,
            CABINET_DEPTH /
            2 -
            0.055
        );


        detailsPanel.renderOrder =
            25;


        root.add(
            detailsPanel
        );


        root.userData.detailsPanel =
            detailsPanel;


        /* INTERIOR LIGHT */

        const interiorLight =
            new THREE.PointLight(
                0xe1f5ff,
                0,
                6
            );


        interiorLight.position.set(
            0,
            3.0,
            1.45
        );


        root.add(
            interiorLight
        );


        root.userData.interiorLight =
            interiorLight;


        /* DOOR */

        const doorPivot =
            new THREE.Group();


        doorPivot.position.set(
            -CABINET_WIDTH /
            2 +
            0.25,
            0,
            CABINET_DEPTH /
            2 +
            0.18
        );


        const doorGroup =
            new THREE.Group();


        const doorWidth =
            CABINET_WIDTH -
            0.50;


        const doorHeight =
            4.10;


        doorGroup.position.x =
            doorWidth /
            2;


        const doorPanel =
            createBox(
                doorWidth,
                doorHeight,
                0.105,
                MATERIALS.door
            );


        doorPanel.position.y =
            2.82;


        doorGroup.add(
            doorPanel
        );


        /* DOOR FRAME */

        const frameThickness =
            0.11;


        const leftFrame =
            createBox(
                frameThickness,
                doorHeight,
                0.16,
                MATERIALS.frame
            );


        leftFrame.position.set(
            -doorWidth /
            2 +
            frameThickness /
            2,
            2.82,
            0.08
        );


        doorGroup.add(
            leftFrame
        );


        const rightFrame =
            leftFrame.clone();


        rightFrame.position.x =
            doorWidth /
            2 -
            frameThickness /
            2;


        doorGroup.add(
            rightFrame
        );


        const topFrame =
            createBox(
                doorWidth,
                frameThickness,
                0.16,
                MATERIALS.frame
            );


        topFrame.position.set(
            0,
            2.82 +
            doorHeight /
            2 -
            frameThickness /
            2,
            0.08
        );


        doorGroup.add(
            topFrame
        );


        const bottomFrame =
            topFrame.clone();


        bottomFrame.position.y =
            2.82 -
            doorHeight /
            2 +
            frameThickness /
            2;


        doorGroup.add(
            bottomFrame
        );


        /* HANDLE */

        const handle =
            createBox(
                0.13,
                0.88,
                0.19,

                makeStandardMaterial(
                    0x12437e,
                    {
                        roughness:
                            0.23,

                        metalness:
                            0.68
                    }
                )
            );


        handle.position.set(
            doorWidth /
            2 -
            0.33,
            2.82,
            0.17
        );


        doorGroup.add(
            handle
        );


        /* DOOR LABEL */

        const doorTexture =
            createTextTexture(
                {
                    width:
                        950,

                    height:
                        320,

                    background:
                        "#edf6ff",

                    border:
                        "#79a9d8",

                    borderWidth:
                        9,

                    startY:
                        102,

                    lines: [

                        {
                            text:
                                "CATEGORY STORAGE",

                            size:
                                37,

                            weight:
                                "900",

                            color:
                                "#24629f",

                            lineHeight:
                                72
                        },

                        {
                            text:
                                category,

                            size:
                                34,

                            weight:
                                "900",

                            color:
                                "#123451",

                            maxWidth:
                                860
                        }
                    ]
                }
            );


        const doorLabel =
            createLabelPlane(
                2.45,
                0.90,
                doorTexture
            );


        doorLabel.position.set(
            0,
            2.82,
            0.061
        );


        doorGroup.add(
            doorLabel
        );


        doorPivot.add(
            doorGroup
        );


        root.add(
            doorPivot
        );


        root.userData.doorPivot =
            doorPivot;


        /* ====================================================
           INVISIBLE SELECTION OBJECT
           NO BLUE WIREFRAME
           NO DIAGONAL LINE
        ==================================================== */

        const highlight =
            new THREE.Mesh(
                new THREE.BoxGeometry(
                    CABINET_WIDTH +
                    0.14,
                    CABINET_HEIGHT +
                    0.14,
                    CABINET_DEPTH +
                    0.14
                ),

                new THREE.MeshBasicMaterial(
                    {
                        color:
                            0x4a9cff,

                        transparent:
                            true,

                        opacity:
                            0,

                        wireframe:
                            false,

                        depthWrite:
                            false
                    }
                )
            );


        highlight.position.y =
            CABINET_Y;


        highlight.visible =
            false;


        root.add(
            highlight
        );


        root.userData.highlight =
            highlight;


        /* FULL CABINET HITBOX */

        const hitbox =
            new THREE.Mesh(
                new THREE.BoxGeometry(
                    CABINET_WIDTH +
                    0.12,
                    CABINET_HEIGHT +
                    0.08,
                    CABINET_DEPTH +
                    1.20
                ),

                new THREE.MeshBasicMaterial(
                    {
                        transparent:
                            true,

                        opacity:
                            0.001,

                        depthWrite:
                            false,

                        depthTest:
                            false
                    }
                )
            );


        hitbox.position.set(
            0,
            CABINET_Y,
            0.28
        );


        hitbox.userData = {

            isCabinetHitbox:
                true,

            cabinetRoot:
                root
        };


        root.add(
            hitbox
        );


        root.userData.hitbox =
            hitbox;


        return root;
    }


    /* ========================================================
       CABINET X
    ======================================================== */

    function cabinetX(index) {

        const totalWidth =
            (
                categories.length -
                1
            ) *
            (
                CABINET_WIDTH +
                CABINET_GAP
            );


        return (
            index *
            (
                CABINET_WIDTH +
                CABINET_GAP
            ) -
            totalWidth /
            2
        );
    }


    /* ========================================================
       DISPOSE
    ======================================================== */

    function disposeObject(object) {

        if (!object) {

            return;
        }


        object.traverse(
            function (child) {

                if (
                    child.geometry
                ) {

                    child.geometry.dispose();
                }


                if (
                    child.material
                ) {

                    const materials =
                        Array.isArray(
                            child.material
                        )
                            ? child.material
                            : [
                                child.material
                            ];


                    materials.forEach(
                        function (material) {

                            if (
                                material.map
                            ) {

                                material.map.dispose();
                            }


                            material.dispose();
                        }
                    );
                }
            }
        );
    }


    function clearCabinets() {

        cabinets.forEach(
            function (cabinet) {

                cabinetGroup.remove(
                    cabinet
                );


                disposeObject(
                    cabinet
                );
            }
        );


        cabinets =
            [];


        selectedCabinet =
            null;


        openedCabinet =
            null;
    }


    /* ========================================================
       PREPARE WAREHOUSE
    ======================================================== */

    function prepareCategoryWarehouse(
        options = {}
    ) {

        clearCabinets();


        categories =
            Array.isArray(
                options.categories
            )
                ? options.categories
                    .map(
                        function (record) {

                            return {

                                category:
                                    normalize(
                                        record.category
                                    ),

                                productTypes:
                                    Array.isArray(
                                        record.productTypes
                                    )
                                        ? record.productTypes
                                            .slice()
                                        : []
                            };
                        }
                    )
                    .filter(
                        function (record) {

                            return Boolean(
                                record.category
                            );
                        }
                    )
                : [];


        categories.forEach(
            function (
                record,
                index
            ) {

                const cabinet =
                    createCabinet(
                        record,
                        index
                    );


                cabinet.position.set(
                    cabinetX(
                        index
                    ),
                    0,
                    0
                );


                cabinetGroup.add(
                    cabinet
                );


                cabinets.push(
                    cabinet
                );
            }
        );


        viewingIndex =
            clamp(
                viewingIndex,
                0,
                Math.max(
                    0,
                    cabinets.length -
                    1
                )
            );


        selectedCategory =
            null;


        selectedCabinet =
            null;


        openedCabinet =
            null;


        updateCabinetHighlights();


        if (
            cabinets.length
        ) {

            moveToCategoryIndex(
                viewingIndex,
                false
            );
        }


        resize();
    }


    /* ========================================================
       LOOKUP
    ======================================================== */

    function getCabinetByCategory(
        category
    ) {

        const target =
            normalize(
                category
            );


        return (
            cabinets.find(
                function (cabinet) {

                    return (
                        cabinet.userData
                            .category ===
                        target
                    );
                }
            ) ||
            null
        );
    }


    /* ========================================================
       SELECTION VISUAL
       FULLY INVISIBLE
    ======================================================== */

    function updateCabinetHighlights() {

        cabinets.forEach(
            function (cabinet) {

                const highlight =
                    cabinet.userData
                        .highlight;


                if (!highlight) {

                    return;
                }


                highlight.material.opacity =
                    0;


                highlight.visible =
                    false;
            }
        );
    }


    /* ========================================================
       SELECT CATEGORY
    ======================================================== */

    function selectCategory(
        category
    ) {

        selectedCategory =
            normalize(
                category
            );


        selectedCabinet =
            getCabinetByCategory(
                selectedCategory
            );


        if (
            selectedCabinet
        ) {

            viewingIndex =
                selectedCabinet
                    .userData
                    .index;
        }


        updateCabinetHighlights();


        return selectedCabinet;
    }


    function clearCategorySelection() {

        selectedCategory =
            null;


        selectedCabinet =
            null;


        updateCabinetHighlights();
    }


    /* ========================================================
       CAMERA
    ======================================================== */

    function moveCamera(
        destination,
        target,
        duration = 850
    ) {

        if (
            cameraTween &&
            cameraTween.cancel
        ) {

            cameraTween.cancel();
        }


        const initialPosition =
            camera.position.clone();


        const initialTarget =
            cameraTarget.clone();


        let cancelled =
            false;


        cameraTween = {

            cancel:
                function () {

                    cancelled =
                        true;
                }
        };


        return new Promise(
            function (resolve) {

                const start =
                    performance.now();


                function frame(now) {

                    if (
                        cancelled
                    ) {

                        resolve();
                        return;
                    }


                    const raw =
                        clamp(
                            (
                                now -
                                start
                            ) /
                            duration,
                            0,
                            1
                        );


                    const t =
                        easeInOutCubic(
                            raw
                        );


                    camera.position.set(

                        lerp(
                            initialPosition.x,
                            destination.x,
                            t
                        ),

                        lerp(
                            initialPosition.y,
                            destination.y,
                            t
                        ),

                        lerp(
                            initialPosition.z,
                            destination.z,
                            t
                        )
                    );


                    cameraTarget.set(

                        lerp(
                            initialTarget.x,
                            target.x,
                            t
                        ),

                        lerp(
                            initialTarget.y,
                            target.y,
                            t
                        ),

                        lerp(
                            initialTarget.z,
                            target.z,
                            t
                        )
                    );


                    if (
                        raw <
                        1
                    ) {

                        requestAnimationFrame(
                            frame
                        );

                    } else {

                        resolve();
                    }
                }


                requestAnimationFrame(
                    frame
                );
            }
        );
    }


    function getBrowseCameraPosition(
        cabinet
    ) {

        return new THREE.Vector3(
            cabinet.position.x,
            5.1,
            CAMERA_BROWSE_Z
        );
    }


    function getBrowseTarget(
        cabinet
    ) {

        return new THREE.Vector3(
            cabinet.position.x,
            3.35,
            0
        );
    }


    /* ========================================================
       CLOSE CABINET
    ======================================================== */

    async function closeCabinet(
        cabinet,
        duration = 700
    ) {

        if (
            !cabinet ||
            !cabinet.userData
                .doorPivot
        ) {

            return;
        }


        const pivot =
            cabinet.userData
                .doorPivot;


        const startAngle =
            pivot.rotation.y;


        if (
            Math.abs(
                startAngle
            ) <
            0.001
        ) {

            cabinet.userData.doorOpen =
                false;


            if (
                cabinet.userData
                    .interiorLight
            ) {

                cabinet.userData
                    .interiorLight
                    .intensity =
                    0;
            }


            if (
                openedCabinet ===
                cabinet
            ) {

                openedCabinet =
                    null;
            }


            return;
        }


        await animateValue(
            duration,

            function (t) {

                pivot.rotation.y =
                    lerp(
                        startAngle,
                        0,
                        t
                    );


                if (
                    cabinet.userData
                        .interiorLight
                ) {

                    cabinet.userData
                        .interiorLight
                        .intensity =
                        lerp(
                            2.0,
                            0,
                            t
                        );
                }
            }
        );


        pivot.rotation.y =
            0;


        cabinet.userData.doorOpen =
            false;


        if (
            openedCabinet ===
            cabinet
        ) {

            openedCabinet =
                null;
        }
    }


    async function closeAllCabinets(
        exceptCabinet = null
    ) {

        for (
            const cabinet
            of cabinets
        ) {

            if (
                cabinet !==
                    exceptCabinet &&
                cabinet.userData
                    .doorOpen
            ) {

                await closeCabinet(
                    cabinet,
                    500
                );
            }
        }
    }


    /* ========================================================
       OPEN DOOR
    ======================================================== */

    async function openCabinetDoor(
        cabinet,
        duration = 1000
    ) {

        if (
            !cabinet ||
            !cabinet.userData
                .doorPivot
        ) {

            return;
        }


        await closeAllCabinets(
            cabinet
        );


        const pivot =
            cabinet.userData
                .doorPivot;


        const startAngle =
            pivot.rotation.y;


        if (
            cabinet.userData
                .doorOpen &&
            Math.abs(
                startAngle -
                DOOR_OPEN_ANGLE
            ) <
                0.02
        ) {

            openedCabinet =
                cabinet;


            return;
        }


        await animateValue(
            duration,

            function (t) {

                pivot.rotation.y =
                    lerp(
                        startAngle,
                        DOOR_OPEN_ANGLE,
                        t
                    );


                if (
                    cabinet.userData
                        .interiorLight
                ) {

                    cabinet.userData
                        .interiorLight
                        .intensity =
                        lerp(
                            0,
                            2.15,
                            t
                        );
                }
            }
        );


        pivot.rotation.y =
            DOOR_OPEN_ANGLE;


        cabinet.userData.doorOpen =
            true;


        openedCabinet =
            cabinet;
    }


    /* ========================================================
       OPEN CATEGORY
    ======================================================== */

    async function openCategoryCabinet(
        category
    ) {

        if (
            animationBusy
        ) {

            return null;
        }


        const cabinet =
            getCabinetByCategory(
                category
            );


        if (!cabinet) {

            console.warn(
                "Stock3D: Cabinet not found:",
                category
            );


            return null;
        }


        if (
            cabinetInteractionBusy
        ) {

            return null;
        }


        cabinetInteractionBusy =
            true;


        try {

            selectedCategory =
                cabinet.userData
                    .category;


            selectedCabinet =
                cabinet;


            viewingIndex =
                cabinet.userData
                    .index;


            updateCabinetHighlights();


            await moveCamera(

                new THREE.Vector3(
                    cabinet.position.x +
                    0.32,
                    3.85,
                    10.5
                ),

                new THREE.Vector3(
                    cabinet.position.x,
                    2.75,
                    0.65
                ),

                900
            );


            await openCabinetDoor(
                cabinet,
                1050
            );


            await moveCamera(

                new THREE.Vector3(
                    cabinet.position.x +
                    0.18,
                    3.35,
                    7.65
                ),

                new THREE.Vector3(
                    cabinet.position.x,
                    2.65,
                    0.80
                ),

                750
            );


            return {

                category:
                    cabinet.userData
                        .category,

                index:
                    cabinet.userData
                        .index,

                productTypes:
                    cabinet.userData
                        .productTypes
                        .slice()
            };


        } finally {

            cabinetInteractionBusy =
                false;
        }
    }


    /* ========================================================
       CATEGORY NAVIGATION
    ======================================================== */

    async function moveToCategoryIndex(
        index,
        animate = true
    ) {

        if (
            !cabinets.length
        ) {

            return null;
        }


        index =
            clamp(
                Number(
                    index
                ) ||
                0,
                0,
                cabinets.length -
                1
            );


        const destinationCabinet =
            cabinets[
                index
            ];


        if (
            openedCabinet &&
            openedCabinet !==
                destinationCabinet
        ) {

            await closeCabinet(
                openedCabinet,
                animate
                    ? 500
                    : 1
            );
        }


        viewingIndex =
            index;


        selectedCategory =
            destinationCabinet
                .userData
                .category;


        selectedCabinet =
            destinationCabinet;


        updateCabinetHighlights();


        const cameraPosition =
            getBrowseCameraPosition(
                destinationCabinet
            );


        const target =
            getBrowseTarget(
                destinationCabinet
            );


        if (
            animate
        ) {

            await moveCamera(
                cameraPosition,
                target,
                720
            );

        } else {

            camera.position.copy(
                cameraPosition
            );


            cameraTarget.copy(
                target
            );
        }


        return {

            index:
                index,

            category:
                destinationCabinet
                    .userData
                    .category,

            productTypes:
                destinationCabinet
                    .userData
                    .productTypes
                    .slice()
        };
    }


    /* ========================================================
       FOCUS
    ======================================================== */

    async function focusSelectedCategory() {

        if (
            !selectedCabinet
        ) {

            selectedCabinet =
                cabinets[
                    viewingIndex
                ] ||
                null;
        }


        if (
            !selectedCabinet
        ) {

            return;
        }


        const cabinet =
            selectedCabinet;


        await moveCamera(

            new THREE.Vector3(
                cabinet.position.x,
                4.15,
                12.75
            ),

            new THREE.Vector3(
                cabinet.position.x,
                3.10,
                0.30
            ),

            850
        );
    }


    /* ========================================================
       INSPECT
    ======================================================== */

    async function inspectSelectedCategory() {

        if (
            !selectedCabinet
        ) {

            selectedCabinet =
                cabinets[
                    viewingIndex
                ] ||
                null;
        }


        if (
            !selectedCabinet
        ) {

            return null;
        }


        return openCategoryCabinet(
            selectedCabinet
                .userData
                .category
        );
    }


    async function closeSelectedCabinet() {

        if (
            !selectedCabinet
        ) {

            return;
        }


        await closeCabinet(
            selectedCabinet,
            700
        );
    }


    /* ========================================================
       CLICK CALLBACK
    ======================================================== */

    function setCategoryClickHandler(
        callback
    ) {

        categoryClickHandler =
            typeof callback ===
                "function"
                ? callback
                : null;
    }


    /* ========================================================
       POINTER
    ======================================================== */

    function updatePointer(
        event
    ) {

        const rect =
            canvas.getBoundingClientRect();


        pointer.x =
            (
                (
                    event.clientX -
                    rect.left
                ) /
                rect.width
            ) *
            2 -
            1;


        pointer.y =
            -(
                (
                    event.clientY -
                    rect.top
                ) /
                rect.height
            ) *
            2 +
            1;
    }


    function getCabinetUnderPointer(
        event
    ) {

        updatePointer(
            event
        );


        raycaster.setFromCamera(
            pointer,
            camera
        );


        const hitboxes =
            cabinets
                .map(
                    function (cabinet) {

                        return cabinet
                            .userData
                            .hitbox;
                    }
                )
                .filter(Boolean);


        const intersections =
            raycaster.intersectObjects(
                hitboxes,
                false
            );


        if (
            !intersections.length
        ) {

            return null;
        }


        return (
            intersections[
                0
            ].object
                .userData
                .cabinetRoot ||
            null
        );
    }


    /* ========================================================
       CURSOR
    ======================================================== */

    canvas.addEventListener(
        "pointermove",
        function (event) {

            if (rightDragActive) {

                const dx =
                    event.clientX -
                    rightDragLastX;

                const dy =
                    event.clientY -
                    rightDragLastY;

                rightDragLastX =
                    event.clientX;

                rightDragLastY =
                    event.clientY;

                if (
                    cameraTween &&
                    cameraTween.cancel
                ) {
                    cameraTween.cancel();
                }

                const panScale =
                    clamp(
                        camera.position.z / 720,
                        0.012,
                        0.045
                    );

                const shiftX =
                    -dx * panScale;

                const shiftY =
                    dy * panScale;

                camera.position.x +=
                    shiftX;

                cameraTarget.x +=
                    shiftX;

                camera.position.y =
                    clamp(
                        camera.position.y + shiftY,
                        1.0,
                        11.5
                    );

                cameraTarget.y =
                    clamp(
                        cameraTarget.y + shiftY,
                        0.4,
                        9.0
                    );

                canvas.style.cursor =
                    "grabbing";

                event.preventDefault();
                return;
            }

            if (
                animationBusy
            ) {

                canvas.style.cursor =
                    "default";

                return;
            }


            const cabinet =
                getCabinetUnderPointer(
                    event
                );


            canvas.style.cursor =
                cabinet
                    ? "pointer"
                    : "grab";
        }
    );


    canvas.addEventListener(
        "pointerleave",
        function (event) {

            if (
                rightDragActive &&
                event.buttons === 0
            ) {
                rightDragActive =
                    false;

                rightDragPointerId =
                    null;
            }

            canvas.style.cursor =
                rightDragActive
                    ? "grabbing"
                    : "default";

            pointerDownCabinet =
                null;
        }
    );


    canvas.addEventListener(
        "pointerdown",
        function (event) {

            if (event.button === 2) {

                rightDragActive =
                    true;

                rightDragPointerId =
                    event.pointerId;

                rightDragLastX =
                    event.clientX;

                rightDragLastY =
                    event.clientY;

                pointerDownCabinet =
                    null;

                if (
                    canvas.setPointerCapture
                ) {
                    try {
                        canvas.setPointerCapture(
                            event.pointerId
                        );
                    } catch (ignore) {}
                }

                canvas.style.cursor =
                    "grabbing";

                event.preventDefault();
                return;
            }

            if (event.button !== 0) {
                return;
            }

            pointerDownCabinet =
                getCabinetUnderPointer(
                    event
                );
        }
    );


    // V6.1 RIGHT DRAG STOP
    canvas.addEventListener(
        "contextmenu",
        function (event) {
            event.preventDefault();
        }
    );


    function stopOpenRackRightDrag(event) {

        if (!rightDragActive) {
            return;
        }

        if (
            event &&
            rightDragPointerId !== null &&
            event.pointerId !== undefined &&
            event.pointerId !== rightDragPointerId
        ) {
            return;
        }

        if (
            canvas.releasePointerCapture &&
            rightDragPointerId !== null
        ) {
            try {
                canvas.releasePointerCapture(
                    rightDragPointerId
                );
            } catch (ignore) {}
        }

        rightDragActive =
            false;

        rightDragPointerId =
            null;

        canvas.style.cursor =
            "grab";
    }


    canvas.addEventListener(
        "pointerup",
        stopOpenRackRightDrag
    );


    canvas.addEventListener(
        "pointercancel",
        stopOpenRackRightDrag
    );


    /* ========================================================
       CABINET CLICK
    ======================================================== */

    canvas.addEventListener(
        "click",
        async function (event) {

            if (
                animationBusy
            ) {

                return;
            }


            const pointerCabinet =
                getCabinetUnderPointer(
                    event
                );


            const cabinet =
                pointerCabinet ||
                pointerDownCabinet;


            pointerDownCabinet =
                null;


            if (
                !cabinet
            ) {

                return;
            }


            selectedCabinet =
                cabinet;


            selectedCategory =
                cabinet.userData
                    .category;


            viewingIndex =
                cabinet.userData
                    .index;


            updateCabinetHighlights();


            if (
                typeof categoryClickHandler ===
                "function"
            ) {

                try {

                    await categoryClickHandler(
                        {
                            category:
                                cabinet.userData
                                    .category,

                            productTypes:
                                cabinet.userData
                                    .productTypes
                                    .slice(),

                            index:
                                cabinet.userData
                                    .index
                        }
                    );

                } catch (error) {

                    console.error(
                        "Stock3D cabinet callback error:",
                        error
                    );
                }

            } else {

                await openCategoryCabinet(
                    cabinet.userData
                        .category
                );
            }


            await delay(
                INSPECTION_READ_TIME
            );


            scrollToCategoryTable();
        }
    );


    /* ========================================================
       MOVEMENT PRODUCT CARD
    ======================================================== */

    function createMovementProductCard(
        options
    ) {

        const root =
            new THREE.Group();


        const isInward =
            options.movementType ===
            "inward";


        const boxWidth =
            2.90;


        const boxHeight =
            1.76;


        const boxDepth =
            1.38;


        const body =
            createBox(
                boxWidth,
                boxHeight,
                boxDepth,

                makeStandardMaterial(
                    isInward
                        ? 0xeaf8f0
                        : 0xffeeee,

                    {
                        roughness:
                            0.44,

                        metalness:
                            0.04
                    }
                )
            );


        root.add(
            body
        );


        const top =
            createBox(
                boxWidth +
                0.04,
                0.075,
                boxDepth +
                0.04,

                makeStandardMaterial(
                    isInward
                        ? 0xb9e5ca
                        : 0xf3c0c0
                )
            );


        top.position.y =
            boxHeight /
            2 +
            0.045;


        root.add(
            top
        );


        const quantity =
            Number(
                options.quantity
            ) ||
            0;


        const unit =
            safeText(
                options.unit,
                "Nos"
            );


        const texture =
            createTextTexture(
                {
                    width:
                        1150,

                    height:
                        680,

                    background:
                        isInward
                            ? "#f4fcf7"
                            : "#fff5f5",

                    border:
                        isInward
                            ? "#2aa762"
                            : "#d94e4e",

                    borderWidth:
                        14,

                    startY:
                        88,

                    lines: [

                        {
                            text:
                                isInward
                                    ? "↓ INWARD STOCK"
                                    : "↑ OUTWARD STOCK",

                            size:
                                50,

                            weight:
                                "900",

                            color:
                                isInward
                                    ? "#14733f"
                                    : "#a83232",

                            lineHeight:
                                90
                        },

                        {
                            text:
                                safeText(
                                    options.productName,
                                    "PRODUCT"
                                ),

                            size:
                                55,

                            weight:
                                "900",

                            color:
                                "#102f4d",

                            lineHeight:
                                100,

                            maxWidth:
                                1020
                        },

                        {
                            text:
                                "QUANTITY",

                            size:
                                30,

                            weight:
                                "800",

                            color:
                                "#6e8497",

                            lineHeight:
                                65
                        },

                        {
                            text:
                                quantity +
                                " " +
                                unit,

                            size:
                                69,

                            weight:
                                "900",

                            color:
                                isInward
                                    ? "#168d4b"
                                    : "#d13d3d"
                        }
                    ]
                }
            );


        const frontLabel =
            createLabelPlane(
                2.66,
                1.56,
                texture
            );


        frontLabel.position.z =
            boxDepth /
            2 +
            0.012;


        root.add(
            frontLabel
        );


        const topTexture =
            createTextTexture(
                {
                    width:
                        900,

                    height:
                        300,

                    background:
                        isInward
                            ? "#d8f3e2"
                            : "#f5dada",

                    border:
                        isInward
                            ? "#2ca866"
                            : "#d45555",

                    borderWidth:
                        10,

                    startY:
                        102,

                    lines: [

                        {
                            text:
                                isInward
                                    ? "INWARD"
                                    : "OUTWARD",

                            size:
                                45,

                            weight:
                                "900",

                            color:
                                isInward
                                    ? "#126e3d"
                                    : "#a83636",

                            lineHeight:
                                75
                        },

                        {
                            text:
                                quantity +
                                " " +
                                unit,

                            size:
                                38,

                            weight:
                                "900",

                            color:
                                "#173750"
                        }
                    ]
                }
            );


        const topLabel =
            createLabelPlane(
                2.35,
                0.75,
                topTexture
            );


        topLabel.rotation.x =
            -Math.PI /
            2;


        topLabel.position.y =
            boxHeight /
            2 +
            0.083;


        root.add(
            topLabel
        );


        const glow =
            new THREE.PointLight(
                isInward
                    ? 0x53e792
                    : 0xff7373,
                1.9,
                9
            );


        glow.position.set(
            0,
            1.2,
            2
        );


        root.add(
            glow
        );


        return root;
    }


    /* ========================================================
       MOVEMENT BANNER
    ======================================================== */

    function createMovementBanner(
        options
    ) {

        const isInward =
            options.movementType ===
            "inward";


        const quantity =
            Number(
                options.quantity
            ) ||
            0;


        const unit =
            safeText(
                options.unit,
                "Nos"
            );


        const texture =
            createTextTexture(
                {
                    width:
                        1250,

                    height:
                        350,

                    background:
                        isInward
                            ? "#107444"
                            : "#b33a3a",

                    border:
                        isInward
                            ? "#52df92"
                            : "#ff8989",

                    borderWidth:
                        13,

                    startY:
                        85,

                    lines: [

                        {
                            text:
                                isInward
                                    ? "↓ INWARD STOCK"
                                    : "↑ OUTWARD STOCK",

                            size:
                                46,

                            weight:
                                "900",

                            color:
                                "#ffffff",

                            lineHeight:
                                82
                        },

                        {
                            text:
                                safeText(
                                    options.productName,
                                    "PRODUCT"
                                ),

                            size:
                                42,

                            weight:
                                "900",

                            color:
                                "#ffffff",

                            lineHeight:
                                72,

                            maxWidth:
                                1130
                        },

                        {
                            text:
                                quantity +
                                " " +
                                unit,

                            size:
                                37,

                            weight:
                                "900",

                            color:
                                "#ffffff"
                        }
                    ]
                }
            );


        const banner =
            createLabelPlane(
                6.20,
                1.58,
                texture,
                {
                    depthWrite:
                        false,

                    depthTest:
                        false
                }
            );


        banner.renderOrder =
            1000;


        return banner;
    }


    /* ========================================================
       MOVEMENT SUCCESS
       NO WIREFRAME USED
    ======================================================== */

    async function flashCabinetSuccess(
        cabinet,
        inward
    ) {

        if (
            !cabinet ||
            !cabinet.userData
                .interiorLight
        ) {

            return;
        }


        const light =
            cabinet.userData
                .interiorLight;


        const originalIntensity =
            light.intensity;


        light.color.set(
            inward
                ? 0x65eca0
                : 0xff8080
        );


        await animateValue(
            350,

            function (t) {

                light.intensity =
                    lerp(
                        originalIntensity,
                        3.4,
                        t
                    );
            }
        );


        await animateValue(
            600,

            function (t) {

                light.intensity =
                    lerp(
                        3.4,
                        2.15,
                        t
                    );
            }
        );


        light.color.set(
            0xe1f5ff
        );


        light.intensity =
            2.15;
    }


    /* ========================================================
       STOCK MOVEMENT
    ======================================================== */

    async function animateStockMovement(
        options = {}
    ) {

        if (
            animationBusy
        ) {

            return;
        }


        const movementType =
            options.movementType ===
            "outward"
                ? "outward"
                : "inward";


        let cabinet =
            getCabinetByCategory(
                options.category ||
                selectedCategory
            );


        if (
            !cabinet
        ) {

            cabinet =
                selectedCabinet ||
                cabinets[
                    viewingIndex
                ] ||
                null;
        }


        if (
            !cabinet
        ) {

            console.warn(
                "Stock3D: Movement cabinet not found."
            );


            return;
        }


        animationBusy =
            true;


        selectedCabinet =
            cabinet;


        selectedCategory =
            cabinet.userData
                .category;


        viewingIndex =
            cabinet.userData
                .index;


        updateCabinetHighlights();


        let productCard =
            null;


        let banner =
            null;


        try {

            await closeAllCabinets(
                cabinet
            );


            await moveCamera(

                new THREE.Vector3(
                    cabinet.position.x +
                    0.40,
                    4.55,
                    12.5
                ),

                new THREE.Vector3(
                    cabinet.position.x,
                    2.85,
                    0.45
                ),

                MOVEMENT_TIMING.focus
            );


            await delay(
                MOVEMENT_TIMING.highlight
            );


            banner =
                createMovementBanner(
                    {
                        movementType:
                            movementType,

                        productName:
                            options.productName,

                        quantity:
                            options.quantity,

                        unit:
                            options.unit
                    }
                );


            banner.position.set(
                cabinet.position.x,
                5.80,
                1.95
            );


            movementGroup.add(
                banner
            );


            await delay(
                MOVEMENT_TIMING.bannerPause
            );


            await openCabinetDoor(
                cabinet,
                MOVEMENT_TIMING.doorOpen
            );


            await delay(
                MOVEMENT_TIMING.doorOpenPause
            );


            productCard =
                createMovementProductCard(
                    {
                        movementType:
                            movementType,

                        productName:
                            options.productName,

                        quantity:
                            options.quantity,

                        unit:
                            options.unit
                    }
                );


            movementGroup.add(
                productCard
            );


            const inside =
                new THREE.Vector3(
                    cabinet.position.x,
                    2.65,
                    0.40
                );


            const outside =
                new THREE.Vector3(
                    cabinet.position.x,
                    2.70,
                    5.65
                );


            if (
                movementType ===
                "inward"
            ) {

                productCard.position.copy(
                    outside
                );


                productCard.scale.setScalar(
                    1.06
                );

            } else {

                productCard.position.copy(
                    inside
                );


                productCard.scale.setScalar(
                    0.80
                );
            }


            await delay(
                MOVEMENT_TIMING.productPause
            );


            const startPosition =
                productCard.position
                    .clone();


            const destination =
                movementType ===
                    "inward"
                    ? inside
                    : outside;


            const startScale =
                productCard.scale.x;


            const endScale =
                movementType ===
                    "inward"
                    ? 0.79
                    : 1.12;


            await animateValue(
                MOVEMENT_TIMING.productTravel,

                function (t) {

                    productCard.position.set(

                        lerp(
                            startPosition.x,
                            destination.x,
                            t
                        ),

                        lerp(
                            startPosition.y,
                            destination.y,
                            t
                        ) +
                        Math.sin(
                            Math.PI *
                            t
                        ) *
                        0.23,

                        lerp(
                            startPosition.z,
                            destination.z,
                            t
                        )
                    );


                    const scale =
                        lerp(
                            startScale,
                            endScale,
                            t
                        );


                    productCard.scale.setScalar(
                        scale
                    );
                }
            );


            await flashCabinetSuccess(
                cabinet,
                movementType ===
                "inward"
            );


            await delay(
                MOVEMENT_TIMING.resultPause
            );


            if (
                productCard
            ) {

                movementGroup.remove(
                    productCard
                );


                disposeObject(
                    productCard
                );


                productCard =
                    null;
            }


            await closeCabinet(
                cabinet,
                MOVEMENT_TIMING.doorClose
            );


            if (
                banner
            ) {

                await animateValue(
                    450,

                    function (t) {

                        if (
                            banner.material
                        ) {

                            banner.material.opacity =
                                1 -
                                t;
                        }
                    }
                );


                movementGroup.remove(
                    banner
                );


                disposeObject(
                    banner
                );


                banner =
                    null;
            }


            await delay(
                MOVEMENT_TIMING.finalPause
            );


        } finally {

            if (
                productCard
            ) {

                movementGroup.remove(
                    productCard
                );


                disposeObject(
                    productCard
                );
            }


            if (
                banner
            ) {

                movementGroup.remove(
                    banner
                );


                disposeObject(
                    banner
                );
            }


            animationBusy =
                false;


            updateCabinetHighlights();
        }
    }


    /* ========================================================
       STORE PRODUCT
    ======================================================== */

    async function storeProduct(
        options = {}
    ) {

        return animateStockMovement(
            {
                movementType:
                    "inward",

                category:
                    options.category ||
                    selectedCategory,

                productId:
                    options.productId,

                productName:
                    options.productName,

                quantity:
                    options.quantity,

                unit:
                    options.unit ||
                    "Nos"
            }
        );
    }


    /* ========================================================
       RESIZE
    ======================================================== */

    function resize() {

        const width =
            Math.max(
                1,
                container.clientWidth
            );


        const height =
            Math.max(
                1,
                container.clientHeight
            );


        renderer.setSize(
            width,
            height,
            false
        );


        camera.aspect =
            width /
            height;


        camera.updateProjectionMatrix();
    }


    window.addEventListener(
        "resize",
        resize
    );


    if (
        typeof ResizeObserver !==
        "undefined"
    ) {

        const observer =
            new ResizeObserver(
                function () {

                    resize();
                }
            );


        observer.observe(
            container
        );
    }


    /* ========================================================
       RENDER LOOP
    ======================================================== */

    function render() {

        requestAnimationFrame(
            render
        );


        camera.lookAt(
            cameraTarget
        );


        renderer.render(
            scene,
            camera
        );
    }


    resize();


    render();


    /* ========================================================
       PUBLIC API
    ======================================================== */

    window.Stock3D = {

        prepareCategoryWarehouse:
            prepareCategoryWarehouse,

        setCategoryClickHandler:
            setCategoryClickHandler,

        moveToCategoryIndex:
            moveToCategoryIndex,

        selectCategory:
            selectCategory,

        clearCategorySelection:
            clearCategorySelection,

        focusSelectedCategory:
            focusSelectedCategory,

        inspectSelectedCategory:
            inspectSelectedCategory,

        openCategoryCabinet:
            openCategoryCabinet,

        closeSelectedCabinet:
            closeSelectedCabinet,

        animateStockMovement:
            animateStockMovement,

        storeProduct:
            storeProduct,

        resize:
            resize,


        getSelectedCategory:
            function () {

                return selectedCategory;
            },


        getViewingIndex:
            function () {

                return viewingIndex;
            },


        getCategories:
            function () {

                return categories.map(
                    function (category) {

                        return {

                            category:
                                category.category,

                            productTypes:
                                category
                                    .productTypes
                                    .slice()
                        };
                    }
                );
            },


        isCabinetOpen:
            function () {

                return Boolean(
                    openedCabinet
                );
            },


        isAnimationBusy:
            function () {

                return animationBusy;
            }
    };


})();