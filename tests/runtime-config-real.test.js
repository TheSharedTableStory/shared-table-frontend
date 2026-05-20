// REAL coverage for js/runtime-config.js — loads the actual module via jsdom
// and asserts the resolved window.__TSTS_RUNTIME__ shape across configurations.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "js", "runtime-config.js"), "utf-8");

function loadConfig(opts) {
  opts = opts || {};
  document.head.innerHTML = "";
  delete window.__TSTS_RUNTIME__;
  delete window.__TSTS_RUNTIME_CONFIG__;

  if (opts.runtime) window.__TSTS_RUNTIME_CONFIG__ = opts.runtime;
  if (opts.meta) {
    for (const key of Object.keys(opts.meta)) {
      const tag = document.createElement("meta");
      tag.setAttribute("name", key);
      tag.setAttribute("content", opts.meta[key]);
      document.head.appendChild(tag);
    }
  }
  if (opts.hostname) {
    // jsdom's window.location is non-configurable; substitute the whole object
    // with a minimal shim that has the hostname we want.
    Object.defineProperty(window, "location", {
      value: { hostname: opts.hostname, href: "http://" + opts.hostname + "/" },
      writable: true,
      configurable: true,
    });
  }

  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  return window.__TSTS_RUNTIME__;
}

describe("runtime-config", () => {
  test("no config, non-localhost: apiBase is empty string", () => {
    const r = loadConfig({ hostname: "thesharedtablestory.com" });
    expect(r.apiBase).toBe("");
  });

  test("localhost defaults to http://localhost:4000", () => {
    const r = loadConfig({ hostname: "localhost" });
    expect(r.apiBase).toBe("http://localhost:4000");
  });

  test("127.0.0.1 defaults to http://localhost:4000", () => {
    const r = loadConfig({ hostname: "127.0.0.1" });
    expect(r.apiBase).toBe("http://localhost:4000");
  });

  test("meta tag tsts-api-base wins over localhost default", () => {
    const r = loadConfig({ hostname: "localhost", meta: { "tsts-api-base": "https://api.example.com" } });
    expect(r.apiBase).toBe("https://api.example.com");
  });

  test("runtime config wins over meta", () => {
    const r = loadConfig({
      hostname: "localhost",
      meta: { "tsts-api-base": "https://from-meta.example.com" },
      runtime: { API_BASE: "https://from-runtime.example.com" },
    });
    expect(r.apiBase).toBe("https://from-runtime.example.com");
  });

  test("trailing slash stripped from apiBase", () => {
    const r = loadConfig({ runtime: { API_BASE: "https://api.example.com/" } });
    expect(r.apiBase).toBe("https://api.example.com");
  });

  test("/api suffix stripped from apiBase", () => {
    const r = loadConfig({ runtime: { API_BASE: "https://api.example.com/api" } });
    expect(r.apiBase).toBe("https://api.example.com");
  });

  test("apiBase rejected if it starts with / (relative path forbidden)", () => {
    const r = loadConfig({ hostname: "thesharedtablestory.com", runtime: { API_BASE: "/api" } });
    expect(r.apiBase).toBe("");
  });

  test("cloudinaryUrl propagated from runtime config", () => {
    const r = loadConfig({ runtime: { CLOUDINARY_URL: "https://res.cloudinary.com/x" } });
    expect(r.cloudinaryUrl).toBe("https://res.cloudinary.com/x");
  });

  test("cloudinaryUrl from meta tag", () => {
    const r = loadConfig({ meta: { "tsts-cloudinary-url": "https://res.cloudinary.com/y" } });
    expect(r.cloudinaryUrl).toBe("https://res.cloudinary.com/y");
  });

  test("window.__TSTS_RUNTIME__ is frozen", () => {
    const r = loadConfig({});
    expect(Object.isFrozen(r)).toBe(true);
  });
});
