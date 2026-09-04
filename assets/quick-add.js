if (!customElements.get('quick-add-modal')) {
  customElements.define(
    'quick-add-modal',
    class QuickAddModal extends ModalDialog {
      constructor() {
        super();

        this.modalContent = this.querySelector('#QuickStandardModal');
        this.clearTimer = null;
        this.abortController = null;

        this.addEventListener('product-info:loaded', ({ target }) => {
          if (typeof target.addPreProcessCallback === 'function') {
            target.addPreProcessCallback(this.preprocessHTML.bind(this));
          }
        });
      }

      hide(preventFocus = false) {
        const cartDrawer = document.querySelector('cart-drawer');

        if (cartDrawer) {
          cartDrawer.setActiveElement(this.openedBy);
        }

        /*
         * Cancel any previous delayed cleanup.
         */
        if (this.clearTimer) {
          clearTimeout(this.clearTimer);
          this.clearTimer = null;
        }

        /*
         * Cancel an in-progress product request.
         */
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }

        /*
         * Clear the modal after the close animation.
         */
        this.clearTimer = setTimeout(() => {
          if (this.modalContent) {
            this.modalContent.replaceChildren();
          }

          this.clearTimer = null;
        }, 300);

        if (preventFocus) {
          this.openedBy = null;
        }

        super.hide();
      }

      async show(opener) {
        /*
         * Prevent a previous hide() timer from clearing the
         * product we're about to load.
         */
        if (this.clearTimer) {
          clearTimeout(this.clearTimer);
          this.clearTimer = null;
        }

        /*
         * Cancel any previous quick-add request.
         */
        if (this.abortController) {
          this.abortController.abort();
        }

        this.abortController = new AbortController();

        const spinner = opener.querySelector('.loading__spinner');

        opener.setAttribute('aria-disabled', 'true');
        opener.classList.add('loading');

        if (spinner) {
          spinner.classList.remove('hidden');
        }

        /*
         * IMPORTANT:
         * Remove ALL DOM/state from the previously opened product
         * before inserting the new product.
         */
        if (this.modalContent) {
          this.modalContent.replaceChildren();

          /*
           * Remove color scheme classes inherited from the previous
           * product-info element.
           */
          Array.from(this.modalContent.classList).forEach((className) => {
            if (
              className.startsWith('color-') ||
              className === 'gradient'
            ) {
              this.modalContent.classList.remove(className);
            }
          });
        }

        const productUrl = opener
          .getAttribute('data-product-url')
          .split('?')[0];

        try {
          const response = await fetch(
            `${productUrl}?view=quick_add&_=${Date.now()}`,
            {
              signal: this.abortController.signal,
              credentials: 'same-origin',
              headers: {
                'X-Requested-With': 'XMLHttpRequest'
              }
            }
          );

          if (!response.ok) {
            throw new Error(
              `Quick add request failed: ${response.status}`
            );
          }

          const responseText = await response.text();

          const responseHTML = new DOMParser().parseFromString(
            responseText,
            'text/html'
          );

          const productElement =
            responseHTML.querySelector('product-info');

          if (!productElement) {
            throw new Error(
              `No product-info element found for ${productUrl}`
            );
          }

          /*
           * Process the NEW product before it enters the modal.
           */
          this.preprocessHTML(productElement);

          /*
           * Make sure the element knows which product was loaded.
           */
          productElement.dataset.productUrl = productUrl;

          /*
           * Insert a completely fresh product-info component.
           */
          HTMLUpdateUtility.setInnerHTML(
            this.modalContent,
            productElement.outerHTML
          );

          /*
           * Force the newly created ProductInfo custom element to
           * start from the newly loaded product rather than any
           * previous product state.
           */
          const newProductInfo =
            this.modalContent.querySelector('product-info');

          if (newProductInfo) {
            newProductInfo.dataset.updateUrl = 'false';

            /*
             * Trigger a clean initialization cycle.
             */
            requestAnimationFrame(() => {
              newProductInfo.dispatchEvent(
                new CustomEvent('quick-add:product-changed', {
                  bubbles: true,
                  detail: {
                    productUrl: productUrl
                  }
                })
              );
            });
          }

          /*
           * Reinitialize Shopify dynamic checkout if it exists.
           */
          if (
            window.Shopify &&
            Shopify.PaymentButton
          ) {
            Shopify.PaymentButton.init();
          }

          /*
           * Reload Shopify's 3D model component if required.
           */
          if (window.ProductModel) {
            window.ProductModel.loadShopifyXR();
          }

          super.show(opener);
        } catch (error) {
          /*
           * An aborted fetch is expected when the customer
           * rapidly opens another product.
           */
          if (error.name !== 'AbortError') {
            console.error(
              'Quick Add Modal Error:',
              error
            );
          }
        } finally {
          opener.removeAttribute('aria-disabled');
          opener.classList.remove('loading');

          if (spinner) {
            spinner.classList.add('hidden');
          }
        }
      }

      preprocessHTML(productElement) {
        if (!productElement) return;

        /*
         * Copy the current product's color scheme only.
         */
        productElement.classList.forEach((classApplied) => {
          if (
            classApplied.startsWith('color-') ||
            classApplied === 'gradient'
          ) {
            this.modalContent.classList.add(classApplied);
          }
        });

        this.preventDuplicatedIDs(productElement);
        this.removeDOMElements(productElement);
        this.removeGalleryListSemantic(productElement);
        this.preventVariantURLSwitching(productElement);
      }

      preventVariantURLSwitching(productElement) {
        productElement.setAttribute(
          'data-update-url',
          'false'
        );
      }

      removeDOMElements(productElement) {
        const pickupAvailability =
          productElement.querySelector('pickup-availability');

        if (pickupAvailability) {
          pickupAvailability.remove();
        }

        const shareButton =
          productElement.querySelector('share-button');

        if (shareButton) {
          shareButton.remove();
        }

        const productModal =
          productElement.querySelector('product-modal');

        if (productModal) {
          productModal.remove();
        }

        productElement
          .querySelectorAll('modal-dialog')
          .forEach((modal) => {
            modal.remove();
          });

        productElement
          .querySelectorAll('side-drawer-opener')
          .forEach((button) => {
            if (
              !button.classList.contains(
                'product-popup-modal__opener--keep'
              )
            ) {
              button.remove();
            }
          });

        productElement
          .querySelectorAll('side-drawer')
          .forEach((drawer) => {
            if (
              !drawer.classList.contains(
                'product-popup-modal__drawer--keep'
              )
            ) {
              drawer.remove();
            }
          });
      }

      preventDuplicatedIDs(productElement) {
        const sectionId = productElement.dataset.section;

        if (!sectionId) return;

        const oldId = sectionId;

        /*
         * Make the quick-add ID unique to this modal load.
         */
        const uniqueSuffix =
          Math.random().toString(36).slice(2, 8);

        const newId =
          `quickadd-${sectionId}-${uniqueSuffix}`;

        productElement.innerHTML =
          productElement.innerHTML.replaceAll(
            oldId,
            newId
          );

        Array.from(productElement.attributes).forEach(
          (attribute) => {
            if (
              attribute.value &&
              attribute.value.includes(oldId)
            ) {
              productElement.setAttribute(
                attribute.name,
                attribute.value.replaceAll(
                  oldId,
                  newId
                )
              );
            }
          }
        );

        productElement.dataset.originalSection =
          sectionId;
      }

      removeGalleryListSemantic(productElement) {
        const galleryList =
          productElement.querySelector(
            '[id^="Slider-Gallery"]'
          );

        if (!galleryList) return;

        galleryList.setAttribute(
          'role',
          'presentation'
        );

        galleryList
          .querySelectorAll('[id^="Slide-"]')
          .forEach((slide) => {
            slide.setAttribute(
              'role',
              'presentation'
            );
          });
      }
    }
  );
}