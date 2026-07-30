/**
 * byob-cart-guard.js
 * ==================
 * Enforces MOQ step constraints on BYOB cart lines.
 *
 * Strategy: patch min/step HTML attributes only.
 * Ella's QuantitySelectorComponent already enforces min via #checkQuantityRules(),
 * and stepUp()/stepDown() respect the step attribute natively.
 * We do NOT override increase/decrease methods — that was causing double-multiplication.
 *
 * The Liquid template (_cart-product.liquid) already renders the correct
 * min/step/data-step attributes server-side. This file just re-applies them
 * after every cart re-render since Ella replaces DOM on quantity changes.
 */

(function () {
  'use strict';

  // ── Toast ────────────────────────────────────────────────────────────────
  let toastEl = null;
  let toastTimer = null;

  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'byob-cart-toast';
      Object.assign(toastEl.style, {
        position:      'fixed',
        bottom:        '24px',
        left:          '50%',
        transform:     'translateX(-50%) translateY(20px)',
        background:    '#044792',
        color:         '#fff',
        padding:       '10px 20px',
        borderRadius:  '100px',
        fontSize:      '1.3rem',
        fontWeight:    '500',
        zIndex:        '99999',
        opacity:       '0',
        transition:    'opacity .25s, transform .25s',
        pointerEvents: 'none',
        whiteSpace:    'nowrap',
        boxShadow:     '0 4px 16px rgba(0,0,0,.18)',
      });
      document.body.appendChild(toastEl);
    }
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    void toastEl.offsetWidth;
    toastEl.style.opacity   = '1';
    toastEl.style.transform = 'translateX(-50%) translateY(0)';
    toastTimer = setTimeout(() => {
      toastEl.style.opacity   = '0';
      toastEl.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3500);
  }

  // ── Snap value to nearest valid multiple >= min ──────────────────────────
  function snapToStep(value, step, min) {
    if (isNaN(value) || value < min) return min;
    return Math.round(value / step) * step;
  }

  // ── Patch a single input — attributes only, no method overrides ──────────
  function patchInput(input) {
    const step = parseInt(input.dataset.step, 10) || 1;
    if (step <= 1) return; // nothing to do for regular products
    // Re-apply in case Ella's re-render wiped them
    input.min  = step;
    input.step = step;
  }

  // ── Patch all eligible inputs in a container ─────────────────────────────
  function patchAll(root) {
    (root || document).querySelectorAll('.quantity__input[data-step]').forEach(patchInput);
  }

  // ── Intercept manual blur — snap before Ella reads the value ─────────────
  document.addEventListener('focusout', function (e) {
    const input = e.target;
    if (!input.classList.contains('quantity__input')) return;

    const step = parseInt(input.dataset.step, 10) || 1;
    if (step <= 1) return;

    const raw     = parseInt(input.value, 10);
    const snapped = snapToStep(raw, step, step);

    if (snapped !== raw) {
      input.value = snapped;

      const mpb = parseInt(input.dataset.mpb, 10) || 0;
      if (mpb > 1) {
        const boxes = snapped / mpb;
        showToast(`Minimum is ${boxes} box${boxes !== 1 ? 'es' : ''} — quantity updated`);
      } else {
        const moq = parseInt(input.dataset.moq, 10) || step;
        showToast(`Minimum order is ${moq} — quantity updated`);
      }
    }
  }, true); // capture phase — runs before Ella's blur handler

  // ── Re-patch after every cart update (Ella fires 'cart:updated') ─────────
  document.addEventListener('cart:updated', () => setTimeout(() => patchAll(), 80));

  // ── Initial patch on page load ────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => patchAll());
  } else {
    patchAll();
  }

  // ── MutationObserver — catch cart drawer re-renders ──────────────────────
  const observer = new MutationObserver(function (mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.querySelector?.('.quantity__input[data-step]')) {
          patchAll(node);
          return;
        }
      }
    }
  });

  function startObserver() {
    [
      document.querySelector('cart-items-component'),
      document.querySelector('cart-drawer-items'),
      document.getElementById('CartDrawer-CartItems'),
      document.getElementById('main-cart-items'),
    ].filter(Boolean).forEach(t => observer.observe(t, { childList: true, subtree: true }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  // ── Checkout button safety net ────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('#CartDrawer-Checkout, [name="checkout"], button[type="submit"][form="cart"]');
    if (!btn) return;

    let blocked = false;
    document.querySelectorAll('.quantity__input[data-step]').forEach(input => {
      const step = parseInt(input.dataset.step, 10) || 1;
      if (step <= 1) return;
      const val = parseInt(input.value, 10);
      if (isNaN(val) || val < step || val % step !== 0) {
        input.value = snapToStep(val, step, step);
        blocked = true;
        input.closest('quantity-selector-component')
          ?.dispatchEvent(new CustomEvent('quantity-selector:update', { bubbles: true }));
      }
    });

    if (blocked) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showToast('Quantities adjusted to meet minimums — please try again');
    }
  }, true);

})();