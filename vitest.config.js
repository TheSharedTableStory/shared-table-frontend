// Owner-spec 2026-05-04: Vitest configuration for the static frontend.
// Uses jsdom so the JS helpers that touch document/DOM run cleanly in tests.

export default {
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    globals: false,
  },
};
