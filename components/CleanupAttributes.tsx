"use client";

import { useEffect } from 'react';

/**
 * Removes browser extension injected attributes from DOM elements
 * These attributes are added by password managers, ad blockers, etc.
 */
export function CleanupAttributes() {
  useEffect(() => {
    // List of attributes to remove
    const attributesToRemove = [
      'bis_skin_checked',
      'bis_register',
      /^__processed_.*__$/, // Matches __processed_*__ pattern
    ];

    // Function to remove attributes from an element
    const removeFromElement = (element: Element) => {
      attributesToRemove.forEach((attr) => {
        if (typeof attr === 'string') {
          if (element.hasAttribute(attr)) {
            element.removeAttribute(attr);
          }
        } else if (attr instanceof RegExp) {
          // Remove attributes matching the regex pattern
          Array.from(element.attributes).forEach(({ name }) => {
            if (attr.test(name)) {
              element.removeAttribute(name);
            }
          });
        }
      });
    };

    const removeAttributes = () => {
      // Remove from all elements including body and html
      if (typeof document !== 'undefined') {
        const allElements = document.querySelectorAll('*');
        allElements.forEach(removeFromElement);
        // Also check document.body and document.documentElement
        if (document.body) removeFromElement(document.body);
        if (document.documentElement) removeFromElement(document.documentElement);
      }
    };

    // Run cleanup immediately
    removeAttributes();

    // Watch for attribute changes and new elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Handle new nodes
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            removeFromElement(node as Element);
            // Also check children
            (node as Element).querySelectorAll('*').forEach(removeFromElement);
          }
        });

        // Handle attribute changes
        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          removeFromElement(mutation.target as Element);
        }
      });
    });

    // Wait for body to be available
    if (typeof document !== 'undefined' && document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true, // Watch for attribute changes
        attributeFilter: ['bis_skin_checked', 'bis_register'], // Only watch specific attributes
      });

      // Also observe document.documentElement for attributes on html/body
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['bis_skin_checked', 'bis_register'],
      });
    }

    // Run cleanup multiple times to catch attributes added at different times
    const timeout1 = setTimeout(removeAttributes, 50);
    const timeout2 = setTimeout(removeAttributes, 200);
    const timeout3 = setTimeout(removeAttributes, 500);
    
    // Also run cleanup periodically to catch attributes added later
    const intervalId = setInterval(removeAttributes, 500);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      clearInterval(intervalId);
      observer.disconnect();
    };
  }, []);

  return null; // This component doesn't render anything
}
