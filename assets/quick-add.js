if (!customElements.get('quick-add-modal')) {
  customElements.define(
    'quick-add-modal',
    class QuickAddModal extends ModalDialog {
      constructor() {
        super();

        this.modalContent = this.querySelector('#QuickStandardModal');

        this.clearTimer = null;
        this.quickAddAbortController = null;

        this.addEventListener('product-info:loaded', ({ target }) => {
          if (typeof target.addPreProcessCallback === 'function') {
            target.addPreProcessCallback(
              this.preprocessHTML.bind(this)
            );
          }
        });
      }

      hide(preventFocus = false) {
        const cartNotification =
          document.querySelector('cart-drawer');

        if (cartNotification) {
          cartNotification.setActiveElement(this.openedBy);
        }

        if (this.quickAddAbortController) {
          this.quickAddAbortController.abort();
          this.quickAddAbortController = null;
        }

        if (this.clearTimer) {
          clearTimeout(this.clearTimer);
          this.clearTimer = null;
        }

        if (preventFocus) {
          this.openedBy = null;
        }

        super.hide();

        this.clearTimer = setTimeout(() => {
          if (this.modalContent) {
            this.modalContent.innerHTML = '';
          }

          this.clearTimer = null;
        }, 300);
      }

      show(opener) {
        if (!opener) return;

        if (this.clearTimer) {
          clearTimeout(this.clearTimer);
          this.clearTimer = null;
        }

        if (this.quickAddAbortController) {
          this.quickAddAbortController.abort();
        }

        this.quickAddAbortController =
          new AbortController();

        /*
         * Completely remove the previous product before
         * loading the next one.
         */
        if (this.modalContent) {
          this.modalContent.innerHTML = '';

          /*
           * Remove any color scheme classes carried over
           * from the previously opened product.
           */
          Array.from(
            this.modalContent.classList
          ).forEach((className) => {
            if (
              className.startsWith('color-') ||
              className === 'gradient'
            ) {
              this.modalContent.classList.remove(
                className
              );
            }
          });
        }

        opener.setAttribute(
          'aria-disabled',
          'true'
        );

        opener.classList.add('loading');

        const spinner =
          opener.querySelector(
            '.loading__spinner'
          );

        if (spinner) {
          spinner.classList.remove('hidden');
        }

        const productUrlAttribute =
          opener.getAttribute(
            'data-product-url'
          );

        if (!productUrlAttribute) {
          opener.removeAttribute(
            'aria-disabled'
          );

          opener.classList.remove(
            'loading'
          );

          if (spinner) {
            spinner.classList.add(
              'hidden'
            );
          }

          console.error(
            'Quick Add: data-product-url was not found.'
          );

          return;
        }

        const productUrl =
          productUrlAttribute.split('?')[0];

        fetch(
          `${productUrl}?view=quick_add&_=${Date.now()}`,
          {
            signal:
              this.quickAddAbortController
                .signal,
            credentials: 'same-origin'
          }
        )
          .then((response) => {
            if (!response.ok) {
              throw new Error(
                `Quick Add request failed: ${response.status}`
              );
            }

            return response.text();
          })

          .then((responseText) => {
            const responseHTML =
              new DOMParser()
                .parseFromString(
                  responseText,
                  'text/html'
                );

            const productElement =
              responseHTML.querySelector(
                'product-info'
              );

            if (!productElement) {
              throw new Error(
                `Quick Add: No product-info element found for ${productUrl}`
              );
            }

            /*
             * Preserve the theme's existing
             * section ID architecture.
             */
            this.preprocessHTML(
              productElement
            );

            /*
             * Insert a completely fresh
             * product-info element.
             */
            HTMLUpdateUtility.setInnerHTML(
              this.modalContent,
              productElement.outerHTML
            );

            const newProductInfo =
              this.modalContent.querySelector(
                'product-info'
              );

            if (newProductInfo) {
              newProductInfo.dataset.updateUrl =
                'false';
            }

            if (
              window.Shopify &&
              Shopify.PaymentButton
            ) {
              Shopify.PaymentButton.init();
            }

            if (window.ProductModel) {
              window.ProductModel
                .loadShopifyXR();
            }

            super.show(opener);
          })

          .catch((error) => {
            if (
              error.name !==
              'AbortError'
            ) {
              console.error(
                'Quick Add Modal Error:',
                error
              );
            }
          })

          .finally(() => {
            opener.removeAttribute(
              'aria-disabled'
            );

            opener.classList.remove(
              'loading'
            );

            if (spinner) {
              spinner.classList.add(
                'hidden'
              );
            }
          });
      }

      preprocessHTML(productElement) {
        if (!productElement) return;

        productElement.classList.forEach(
          (classApplied) => {
            if (
              classApplied.startsWith(
                'color-'
              ) ||
              classApplied === 'gradient'
            ) {
              this.modalContent.classList.add(
                classApplied
              );
            }
          }
        );

        this.preventDuplicatedIDs(
          productElement
        );

        this.removeDOMElements(
          productElement
        );

        this.removeGalleryListSemantic(
          productElement
        );

        this.preventVariantURLSwitching(
          productElement
        );
      }

      preventVariantURLSwitching(
        productElement
      ) {
        productElement.setAttribute(
          'data-update-url',
          'false'
        );
      }

      removeDOMElements(productElement) {
        const pickupAvailability =
          productElement.querySelector(
            'pickup-availability'
          );

        if (pickupAvailability) {
          pickupAvailability.remove();
        }

        const shareButton =
          productElement.querySelector(
            'share-button'
          );

        if (shareButton) {
          shareButton.remove();
        }

        const productModal =
          productElement.querySelector(
            'product-modal'
          );

        if (productModal) {
          productModal.remove();
        }

        const modalDialogs =
          productElement.querySelectorAll(
            'modal-dialog'
          );

        modalDialogs.forEach(
          (modal) => {
            modal.remove();
          }
        );

        const sideDrawerOpeners =
          productElement.querySelectorAll(
            'side-drawer-opener'
          );

        sideDrawerOpeners.forEach(
          (button) => {
            if (
              !button.classList.contains(
                'product-popup-modal__opener--keep'
              )
            ) {
              button.remove();
            }
          }
        );

        const sideDrawers =
          productElement.querySelectorAll(
            'side-drawer'
          );

        sideDrawers.forEach(
          (drawer) => {
            if (
              !drawer.classList.contains(
                'product-popup-modal__drawer--keep'
              )
            ) {
              drawer.remove();
            }
          }
        );
      }

      preventDuplicatedIDs(
        productElement
      ) {
        const sectionId =
          productElement.dataset.section;

        if (!sectionId) return;

        const oldId = sectionId;

        /*
         * Keep the theme's original
         * Quick Add section naming system.
         */
        const newId =
          `quickadd-${sectionId}`;

        productElement.innerHTML =
          productElement.innerHTML
            .replaceAll(
              oldId,
              newId
            );

        Array.from(
          productElement.attributes
        ).forEach((attribute) => {
          if (
            attribute.value &&
            attribute.value.includes(
              oldId
            )
          ) {
            productElement.setAttribute(
              attribute.name,
              attribute.value.replaceAll(
                oldId,
                newId
              )
            );
          }
        });

        productElement.dataset
          .originalSection = sectionId;
      }

      removeGalleryListSemantic(
        productElement
      ) {
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
          .querySelectorAll(
            '[id^="Slide-"]'
          )
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