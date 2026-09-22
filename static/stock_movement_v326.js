/* NUNES Stock v3.2.6 — presentation-only live summary for Add Stock. */
(function () {
    'use strict';

    function byId(id) { return document.getElementById(id); }
    function text(id, fallback) {
        var el = byId(id);
        var value = el ? String(('value' in el ? el.value : el.textContent) || '').trim() : '';
        return value || fallback;
    }
    function set(id, value) {
        var el = byId(id);
        if (el) el.textContent = value;
    }

    function refresh() {
        var movement = text('movementType', 'inward').toLowerCase();
        var unit = text('unit', 'Nos');
        var product = text('productName', '');
        var productId = text('productId', '');
        var qty = text('quantity', '1');
        var after = byId('afterStockValue') ? byId('afterStockValue').textContent.trim() : qty;

        set('v326SummaryProduct', product || productId || 'Not selected');
        set('v326SummaryMovement', movement === 'outward' ? 'Outward Stock' : 'Inward Stock');
        set('v326SummaryQuantity', qty || '1');
        set('v326SummaryUnit', unit);
        set('v326SummaryAfter', after || '0');
        set('v326SummaryAfterUnit', unit);

        var movementEl = byId('v326SummaryMovement');
        if (movementEl) {
            movementEl.classList.toggle('good', movement !== 'outward');
            movementEl.style.color = movement === 'outward' ? '#d94353' : '';
        }
    }

    function boot() {
        if (!byId('stockForm')) return;
        ['movementInward','movementOutward','productId','productName','unit','quantity','quantityMinus','quantityPlus']
            .forEach(function (id) {
                var el = byId(id);
                if (!el) return;
                ['click','input','change','blur'].forEach(function (evt) { el.addEventListener(evt, function () { setTimeout(refresh, 0); }); });
            });

        document.querySelectorAll('[data-stock-quantity]').forEach(function (el) {
            el.addEventListener('click', function () { setTimeout(refresh, 0); });
        });

        var after = byId('afterStockValue');
        if (after && window.MutationObserver) {
            new MutationObserver(refresh).observe(after, {childList:true, characterData:true, subtree:true});
        }
        refresh();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
