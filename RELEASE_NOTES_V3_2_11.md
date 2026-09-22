# NUNES Stock v3.2.11

## Shared staff / owner client model

- The main server remains the only application + database host on port 5055.
- Staff and owner PCs install only a branded desktop shortcut to the central server.
- No Python, Git, database, or application source is required on client PCs.
- Browser clients check server state every 5 seconds.
- New server versions auto-reload idle pages; active data-entry pages show a reload notice so unsaved work is not lost.
- Stock changes made by one user continue to update other read-only pages through the inventory revision mechanism.

## Persistent Shelf Rack repair

- Replaces the old browser-only random shelf distribution with server-side branch database positions.
- On first use, products that were visible in the previous Shelf Rack are migrated once into persistent positions matching the old deterministic layout; after that, positions stay fixed until staff move them.
- Rack count is shared across all PCs for the selected branch.
- Attach an existing inventory product to a shelf.
- Move a product from one shelf to another without changing stock quantity.
- Remove a product from a shelf without deleting the inventory product or stock.
- Clicking a shelf shows all products assigned to that shelf in a list below.
- Clicking a rack header shows all products assigned anywhere in that rack.
- List rows show product, ID/category, brand/model, current quantity, shelf position and actions.
- Product images use the existing strict verified online-image service when available; guessed images are not substituted.
- All active branch inventory products are available to attach, including products that were not in the old storage-category master.
- Rack removal is blocked when the rack still contains assigned products.

## Preserved behaviour

- Current Stock Executive Clean List unchanged.
- Add Stock page unchanged.
- Add From Excel page unchanged.
- Executive Stock History unchanged.
- Existing Open Rack / warehouse engine files `static/stock_3d.js` and `static/storage_view.js` are unchanged.
- Stock quantities/history are not changed by shelf placement operations.
- Rathinapuri, Gopalapuram and Gandhipuram remain separate branch databases.
