import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Screens that wait on a debounced lookup (the ZIP field waits 250ms before asking) can
// overrun the default one-second wait when the machine is busy with another suite. Three
// seconds keeps those tests about behaviour, not about load.
configure({ asyncUtilTimeout: 3000 });

// jsdom has no ResizeObserver. Radix UI components (checkbox, dialog) need one to exist.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no pointer capture or scrollIntoView. Radix Select uses both when it opens.
// (Server-side tests run in the node environment, which has no Element at all.)
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

afterEach(() => {
  cleanup();
});
