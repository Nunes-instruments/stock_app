(() => {
    "use strict";

    const dataNode = document.getElementById("rackInventoryData");
    if (!dataNode) return;

    let inventory;
    try {
        inventory = JSON.parse(dataNode.textContent || "{}");
    } catch (error) {
        console.error("Unable to parse rack inventory data.", error);
        return;
    }

    const racks = Array.isArray(inventory.racks) ? inventory.racks : [];
    const rackByCode = new Map(racks.map(rack => [String(rack.code), rack]));
    const shelfByCode = new Map();

    racks.forEach(rack => {
        (rack.shelves || []).forEach(shelf => {
            shelfByCode.set(String(shelf.code), { rack, shelf });
        });
    });

    // ---------------------------------------------------------
    // Small executive counters
    // ---------------------------------------------------------
    const reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.querySelectorAll("[data-count]").forEach(node => {
        const target = Number(node.dataset.count || 0);
        if (!Number.isFinite(target) || reduceMotion) {
            node.textContent = Math.round(target).toLocaleString();
            return;
        }

        const start = performance.now();
        const duration = 500;

        function tick(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            node.textContent = Math.round(target * eased).toLocaleString();
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    });

    // ---------------------------------------------------------
    // Inspector / search
    // ---------------------------------------------------------
    const title = document.getElementById("rackInspectorTitle");
    const sub = document.getElementById("rackInspectorSub");
    const chips = document.getElementById("rackChips");
    const list = document.getElementById("rackProductList");
    const search = document.getElementById("rackProductSearch");
    const shelfCount = document.getElementById("rackShelfCount");
    const lineCount = document.getElementById("rackLineCount");

    let selectedRackCode = null;
    let selectedShelfCode = null;

    function safe(value) {
        return String(value == null ? "" : value);
    }

    function productRow(item, shelfCode) {
        const model = safe(item.model_brand).trim();
        const qty = safe(item.quantity_text).trim();
        const source = safe(item.source).trim();

        const row = document.createElement("div");
        row.className = "product-row";

        const name = document.createElement("strong");
        name.textContent = safe(item.item) || "Unnamed item";
        row.appendChild(name);

        const meta = document.createElement("small");
        const parts = [];
        if (shelfCode) parts.push(`Shelf ${shelfCode}`);
        if (model) parts.push(model);
        if (source) parts.push(source);
        meta.textContent = parts.join(" · ");
        row.appendChild(meta);

        if (qty) {
            const badge = document.createElement("span");
            badge.className = "product-qty";
            badge.textContent = qty;
            row.appendChild(badge);
        }

        return row;
    }

    function allItemsForRack(rack) {
        const items = [];
        (rack.shelves || []).forEach(shelf => {
            (shelf.items || []).forEach(item => {
                items.push({ item, shelfCode: shelf.code });
            });
        });
        return items;
    }

    function renderProducts(rows, emptyText) {
        if (!list) return;
        list.innerHTML = "";

        if (!rows.length) {
            const empty = document.createElement("div");
            empty.className = "no-products";
            empty.textContent = emptyText || "No matching products.";
            list.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        rows.slice(0, 250).forEach(record => {
            fragment.appendChild(productRow(record.item, record.shelfCode));
        });
        list.appendChild(fragment);
    }

    function markActiveChip(code) {
        document.querySelectorAll(".rack-chip").forEach(button => {
            button.classList.toggle("active", button.dataset.rackCode === code);
        });
    }

    function selectRack(code, focus3d = true) {
        const rack = rackByCode.get(String(code));
        if (!rack) return;

        selectedRackCode = String(code);
        selectedShelfCode = null;
        markActiveChip(selectedRackCode);

        if (title) title.textContent = rack.label || `Rack ${rack.code}`;
        if (sub) {
            sub.textContent = `${rack.shelf_count || 0} occupied shelves · ${rack.item_count || 0} stock lines`;
        }
        if (shelfCount) shelfCount.textContent = String(rack.shelf_count || 0);
        if (lineCount) lineCount.textContent = String(rack.item_count || 0);

        renderProducts(
            allItemsForRack(rack),
            "This rack has no located products."
        );

        if (focus3d) focusRackInScene(selectedRackCode);
    }

    function selectShelf(code, focus3d = true) {
        const entry = shelfByCode.get(String(code));
        if (!entry) return;

        selectedRackCode = String(entry.rack.code);
        selectedShelfCode = String(entry.shelf.code);
        markActiveChip(selectedRackCode);

        if (title) title.textContent = `Shelf ${entry.shelf.code}`;
        if (sub) {
            sub.textContent = `${entry.rack.label || `Rack ${entry.rack.code}`} · ${entry.shelf.item_count || 0} product lines`;
        }
        if (shelfCount) shelfCount.textContent = "1";
        if (lineCount) lineCount.textContent = String(entry.shelf.item_count || 0);

        renderProducts(
            (entry.shelf.items || []).map(item => ({ item, shelfCode: entry.shelf.code })),
            "No products stored on this shelf."
        );

        if (focus3d) focusShelfInScene(selectedShelfCode);
    }

    function buildChips() {
        if (!chips) return;
        chips.innerHTML = "";

        racks.forEach((rack, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "rack-chip";
            button.dataset.rackCode = String(rack.code);
            button.textContent = rack.code;
            button.title = `${rack.label || `Rack ${rack.code}`} · ${rack.item_count || 0} stock lines`;
            button.addEventListener("click", () => selectRack(rack.code));
            chips.appendChild(button);

            if (index === 0) {
                selectedRackCode = String(rack.code);
            }
        });
    }

    buildChips();

    if (search) {
        search.addEventListener("input", () => {
            const query = search.value.trim().toLowerCase();

            if (!query) {
                if (selectedShelfCode) selectShelf(selectedShelfCode, false);
                else if (selectedRackCode) selectRack(selectedRackCode, false);
                return;
            }

            const matches = [];
            racks.forEach(rack => {
                (rack.shelves || []).forEach(shelf => {
                    (shelf.items || []).forEach(item => {
                        const haystack = [
                            item.item,
                            item.model_brand,
                            item.quantity_text,
                            rack.code,
                            shelf.code
                        ].map(safe).join(" ").toLowerCase();

                        if (haystack.includes(query)) {
                            matches.push({ item, shelfCode: shelf.code });
                        }
                    });
                });
            });

            if (title) title.textContent = "Search results";
            if (sub) sub.textContent = `${matches.length} matching stock lines`;
            if (shelfCount) shelfCount.textContent = "—";
            if (lineCount) lineCount.textContent = String(matches.length);
            renderProducts(matches, "No products match this search.");
        });
    }

    // ---------------------------------------------------------
    // 3D rack floor
    // ---------------------------------------------------------
    const mount = document.getElementById("rack3dCanvas");
    if (!mount || !window.THREE || !racks.length) {
        if (mount) {
            mount.innerHTML = '<div class="no-products" style="padding-top:180px">3D rack view is unavailable.</div>';
        }
        if (racks.length) selectRack(racks[0].code, false);
        return;
    }

    const THREE = window.THREE;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfdfdfc);

    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 300);
    camera.position.set(16, 13, 23);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xb8b8b3, 1.25);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(9, 18, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdedede, 0.55);
    fillLight.position.set(-12, 8, -8);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(42, 34),
        new THREE.MeshStandardMaterial({
            color: 0xf2f2ef,
            roughness: 0.96,
            metalness: 0
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    scene.add(floor);

    const root = new THREE.Group();
    scene.add(root);

    const rackGroups = new Map();
    const shelfMeshes = new Map();
    const clickable = [];

    const black = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.48,
        metalness: 0.18
    });
    const shelfMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8e8e4,
        roughness: 0.78,
        metalness: 0.04
    });
    const shelfActiveMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.5,
        metalness: 0.14
    });
    const productMaterials = [
        new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.72 }),
        new THREE.MeshStandardMaterial({ color: 0x575757, roughness: 0.72 }),
        new THREE.MeshStandardMaterial({ color: 0x838383, roughness: 0.72 }),
        new THREE.MeshStandardMaterial({ color: 0xb1b1ad, roughness: 0.78 })
    ];

    function box(w, h, d, material) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            material
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    const columns = 4;
    const rackWidth = 3.2;
    const rackDepth = 1.22;
    const rackHeight = 4.2;
    const xGap = 5.1;
    const zGap = 5.2;

    racks.forEach((rack, rackIndex) => {
        const group = new THREE.Group();

        const col = rackIndex % columns;
        const row = Math.floor(rackIndex / columns);
        group.position.set(
            (col - (columns - 1) / 2) * xGap,
            0,
            (row - 1) * zGap
        );

        const postSize = 0.12;
        const postHeight = rackHeight;

        [
            [-rackWidth / 2, rackDepth / 2],
            [ rackWidth / 2, rackDepth / 2],
            [-rackWidth / 2, -rackDepth / 2],
            [ rackWidth / 2, -rackDepth / 2]
        ].forEach(([x, z]) => {
            const post = box(postSize, postHeight, postSize, black);
            post.position.set(x, postHeight / 2, z);
            group.add(post);
        });

        [0.08, rackHeight - 0.08].forEach(y => {
            const front = box(rackWidth + .18, 0.12, 0.12, black);
            front.position.set(0, y, rackDepth / 2);
            group.add(front);

            const back = front.clone();
            back.position.z = -rackDepth / 2;
            group.add(back);
        });

        const shelves = Array.isArray(rack.shelves) ? rack.shelves : [];
        const count = Math.max(shelves.length, 1);
        const usableHeight = rackHeight - 0.65;

        shelves.forEach((shelf, shelfIndex) => {
            const y = 0.34 + (shelfIndex + 0.35) * (usableHeight / count);

            const shelfMesh = box(rackWidth, 0.10, rackDepth, shelfMaterial.clone());
            shelfMesh.position.set(0, y, 0);
            shelfMesh.userData = {
                type: "shelf",
                rackCode: String(rack.code),
                shelfCode: String(shelf.code)
            };
            clickable.push(shelfMesh);
            shelfMeshes.set(String(shelf.code), shelfMesh);
            group.add(shelfMesh);

            const itemCount = Number(shelf.item_count || 0);
            const blockCount = Math.max(1, Math.min(8, Math.ceil(itemCount / 4)));
            const slots = 4;

            for (let i = 0; i < blockCount; i++) {
                const bx = ((i % slots) - 1.5) * 0.62;
                const bz = i >= slots ? -0.23 : 0.22;
                const scale = 0.68 + ((i + shelfIndex) % 3) * 0.08;

                const product = box(
                    0.42 * scale,
                    0.34 + ((i + 1) % 2) * 0.1,
                    0.38 * scale,
                    productMaterials[(i + shelfIndex) % productMaterials.length]
                );
                product.position.set(bx, y + 0.23, bz);
                product.userData = {
                    type: "shelf",
                    rackCode: String(rack.code),
                    shelfCode: String(shelf.code)
                };
                clickable.push(product);
                group.add(product);
            }
        });

        group.userData = { rackCode: String(rack.code) };
        root.add(group);
        rackGroups.set(String(rack.code), group);
    });

    // Center the rack floor around the origin.
    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;

    let autoRotate = !reduceMotion;
    let isDragging = false;
    let previousX = 0;
    let previousY = 0;
    let rotationX = -0.16;
    let rotationY = -0.42;
    root.rotation.x = rotationX;
    root.rotation.y = rotationY;

    const autoButton = document.getElementById("rackAutoRotate");
    const resetButton = document.getElementById("rackResetView");

    function syncAutoButton() {
        if (!autoButton) return;
        autoButton.classList.toggle("active", autoRotate);
        autoButton.textContent = autoRotate ? "Auto rotate" : "Rotation paused";
    }

    syncAutoButton();

    if (autoButton) {
        autoButton.addEventListener("click", () => {
            autoRotate = !autoRotate;
            syncAutoButton();
        });
    }

    function resetView() {
        camera.position.set(16, 13, 23);
        rotationX = -0.16;
        rotationY = -0.42;
        root.rotation.x = rotationX;
        root.rotation.y = rotationY;
        selectedShelfCode = null;
        resetShelfMaterials();
        if (racks.length) selectRack(racks[0].code, false);
    }

    if (resetButton) resetButton.addEventListener("click", resetView);

    renderer.domElement.addEventListener("pointerdown", event => {
        isDragging = true;
        autoRotate = false;
        syncAutoButton();
        previousX = event.clientX;
        previousY = event.clientY;
        renderer.domElement.setPointerCapture(event.pointerId);
    });

    renderer.domElement.addEventListener("pointermove", event => {
        if (!isDragging) return;

        const dx = event.clientX - previousX;
        const dy = event.clientY - previousY;
        previousX = event.clientX;
        previousY = event.clientY;

        rotationY += dx * 0.006;
        rotationX += dy * 0.0035;
        rotationX = Math.max(-0.5, Math.min(0.28, rotationX));

        root.rotation.x = rotationX;
        root.rotation.y = rotationY;
    });

    renderer.domElement.addEventListener("pointerup", event => {
        isDragging = false;
        try {
            renderer.domElement.releasePointerCapture(event.pointerId);
        } catch (_) {}
    });

    renderer.domElement.addEventListener("wheel", event => {
        event.preventDefault();
        const direction = Math.sign(event.deltaY);
        camera.position.multiplyScalar(direction > 0 ? 1.055 : 0.948);
        const distance = camera.position.length();
        if (distance < 15) camera.position.setLength(15);
        if (distance > 42) camera.position.setLength(42);
    }, { passive: false });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function resetShelfMaterials() {
        shelfMeshes.forEach(mesh => {
            mesh.material = shelfMaterial.clone();
        });
    }

    function focusShelfInScene(code) {
        resetShelfMaterials();
        const mesh = shelfMeshes.get(String(code));
        if (!mesh) return;
        mesh.material = shelfActiveMaterial.clone();
    }

    function focusRackInScene(code) {
        resetShelfMaterials();
        const rack = rackByCode.get(String(code));
        if (!rack) return;
        (rack.shelves || []).forEach(shelf => {
            const mesh = shelfMeshes.get(String(shelf.code));
            if (mesh) {
                mesh.material = new THREE.MeshStandardMaterial({
                    color: 0xcfcfca,
                    roughness: 0.72,
                    metalness: 0.04
                });
            }
        });
    }

    renderer.domElement.addEventListener("click", event => {
        if (isDragging) return;

        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickable, false);

        if (!hits.length) return;

        const target = hits[0].object;
        if (target.userData && target.userData.shelfCode) {
            selectShelf(target.userData.shelfCode, false);
            focusShelfInScene(target.userData.shelfCode);
        }
    });

    function resize() {
        const width = Math.max(320, mount.clientWidth);
        const height = Math.max(420, mount.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    function animate() {
        requestAnimationFrame(animate);

        if (autoRotate && !isDragging) {
            rotationY += 0.0017;
            root.rotation.y = rotationY;
        }

        camera.lookAt(0, 2.0, 0);
        renderer.render(scene, camera);
    }

    animate();

    if (racks.length) {
        selectRack(racks[0].code, false);
        focusRackInScene(racks[0].code);
    }
})();
