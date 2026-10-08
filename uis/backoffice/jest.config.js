/**
 * Scope: pure business-logic modules (form validation, status transitions,
 * error classification, formatting). Deliberately excludes React components,
 * Next.js pages/routes, and the fetch/HTTP-wrapper modules (api.ts,
 * suppliers-api.ts, incidents-api.ts, auth.ts, profile.ts,
 * authenticated-fetch.ts, backend-proxy.ts) — those are thin serialization
 * layers over the network, not logic to unit-test here.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["<rootDir>/lib/**/*.test.ts"],
  collectCoverage: true,
  collectCoverageFrom: [
    "lib/api-error.ts",
    "lib/candidate-form.ts",
    "lib/candidate-meta.ts",
    "lib/format.ts",
    "lib/incidents.ts",
    "lib/supplier-form.ts",
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
