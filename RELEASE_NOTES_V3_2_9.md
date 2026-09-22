# NUNES Stock v3.2.9 — Executive Current Stock + Excel Import

## Current Stock
- Replaced the Option 3 side-panel layout with the selected Option 1 Executive Clean List.
- Full-width live inventory table with Product, Product ID, Category, Brand/Model, Available, Unit, Location, Status, Updated and Actions.
- Real KPI cards: Total Products, Available Quantity, Low Stock and Out of Stock.
- Search plus Category, Status and Location filters.
- Sorting, 8/15/25/50-row pagination, product detail drawer, Add Stock, Export and Archived Products.
- No hard-coded stock values. All metrics and rows come from the active branch database.

## Branch wiring
- Rathinapuri, Gopalapuram and Gandhipuram remain separate databases.
- The global Active Company selector is the single source of branch selection.
- Current Stock and Add From Excel automatically operate against the selected branch.
- Existing internal `gobalapuram` key/database filename remains for backward compatibility while the UI displays Gopalapuram.

## Add From Excel
- Rebuilt to the selected first full-width import design.
- Drag-and-drop or Choose File input.
- Real downloadable NUNES Stock Excel template.
- Supported-column guide uses the actual import schema.
- Existing duplicate protection, validation, import history and stock update logic remain wired.
- Imported result and validation preview use the new design.

## Safety
- Stock databases and stock history are not bundled in the release.
- Rack / Shelf / 3D protected files are unchanged.
- Candidate preflight verifies Dashboard, Current Stock, Add Stock, Add From Excel, template download and Storage View.
- Current Stock is preflight-tested after switching through all three branches.
