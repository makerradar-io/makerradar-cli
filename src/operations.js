// @ts-check

/**
 * Every MakerRadar public API operation this CLI calls, by its OpenAPI `operationId`. One table, so
 * the contract test (`test/contract.test.js`) can check each against the live API description at
 * https://api.makerradar.io/v1/openapi.json — a renamed or retired endpoint fails the test, not a
 * user's command. `{name}` in a path is filled from the call's `params`.
 */
export const OPERATIONS = /** @type {const} */ ({
  listProducts: { method: "GET", path: "/products" },
  getProduct: { method: "GET", path: "/products/{slug}" },
  listProductAlternatives: { method: "GET", path: "/products/{slug}/alternatives" },
  listCategories: { method: "GET", path: "/categories" },
  listCurrentLaunches: { method: "GET", path: "/launches/current" },
  getLaunchWeek: { method: "GET", path: "/launches/{week}" },
  getPricing: { method: "GET", path: "/pricing" },
  createDraft: { method: "POST", path: "/drafts" },
  startAgentConnect: { method: "POST", path: "/agent/connect" },
  finishAgentConnect: { method: "POST", path: "/agent/token" },
  getMe: { method: "GET", path: "/me" },
  listMyListings: { method: "GET", path: "/me/listings" },
  getMyListing: { method: "GET", path: "/me/listings/{id}" },
  listTools: { method: "GET", path: "/tools" },
  runTool: { method: "POST", path: "/tools/{tool}" },
});

/** @typedef {keyof typeof OPERATIONS} OperationId */

/** The scopes a person can grant the CLI (the API's `agentToken` scopes). */
export const SCOPES = /** @type {const} */ ([
  "listings:read",
  "listings:write",
  "launches:write",
  "billing:checkout",
]);
