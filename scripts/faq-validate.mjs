#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(process.cwd());
const catalogPath = path.join(ROOT, "data", "faq-catalog.js");
const trustPath = path.join(ROOT, "data", "faq-trust.js");
const backendPath = path.resolve(ROOT, "..", "Shared-Story-backend", "server.js");

function loadConstFromFile(filePath, constName) {
  const source = fs.readFileSync(filePath, "utf8");
  const wrapped =
    source +
    "\n;globalThis.__faq_value__ = (typeof " +
    constName +
    " !== 'undefined' ? " +
    constName +
    " : undefined);";

  const context = { globalThis: {} };
  vm.createContext(context);
  vm.runInContext(wrapped, context, { filename: filePath });

  return context.globalThis.__faq_value__;
}

function collectRoutes(serverSource) {
  const routes = new Set();
  const routeRegex = /app\.(get|post|patch|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = routeRegex.exec(serverSource)) !== null) {
    const method = String(match[1] || "").toUpperCase();
    const routePath = String(match[2] || "").trim();
    if (!method || !routePath) continue;
    routes.add(method + " " + routePath);
  }
  return routes;
}

function fail(errors, message) {
  errors.push(message);
}

function main() {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(catalogPath)) fail(errors, "Missing data/faq-catalog.js");
  if (!fs.existsSync(trustPath)) fail(errors, "Missing data/faq-trust.js");
  if (!fs.existsSync(backendPath)) fail(errors, "Missing backend route source: ../Shared-Story-backend/server.js");
  if (errors.length > 0) return { errors, warnings };

  const catalog = loadConstFromFile(catalogPath, "FAQ_CATALOG");
  const trustConfig = loadConstFromFile(trustPath, "FAQ_TRUST_CONFIG");
  const routeSource = fs.readFileSync(backendPath, "utf8");
  const knownRoutes = collectRoutes(routeSource);

  if (!Array.isArray(catalog)) {
    fail(errors, "FAQ_CATALOG is missing or not an array.");
    return { errors, warnings };
  }

  if (!trustConfig || typeof trustConfig !== "object") {
    fail(errors, "FAQ_TRUST_CONFIG is missing or invalid.");
    return { errors, warnings };
  }

  const requiredFields = [
    "id",
    "hub",
    "section",
    "question",
    "answer",
    "answerMode",
    "sourceRefs",
    "contexts",
    "trustSurface",
    "status",
    "version",
    "effectiveDate",
    "lastReviewed"
  ];

  const forbiddenTerms = [
    /\blean\s+launch\b/i,
    /\bmvp\b/i,
    /\bbeta\b/i,
    /\bphase\b/i,
    /\binternal\b/i,
    /\bv1\b/i,
    /\bTSTS\b/
  ];

  const allowedModes = new Set(["deterministic", "policy_bound", "conditional", "gap"]);
  const allowedSourceTypes = new Set(["route", "policy", "page"]);
  const byId = new Map();
  const activeItems = [];

  catalog.forEach((item, idx) => {
    if (!item || typeof item !== "object") {
      fail(errors, "Item " + idx + " is not an object.");
      return;
    }

    requiredFields.forEach((field) => {
      if (!(field in item)) fail(errors, "Item " + String(item.id || idx) + " missing field: " + field);
    });

    const id = String(item.id || "").trim();
    if (!id) fail(errors, "Item at index " + idx + " has empty id.");
    if (id && byId.has(id)) fail(errors, "Duplicate FAQ id: " + id);
    if (id) byId.set(id, item);

    if (!allowedModes.has(String(item.answerMode || ""))) {
      fail(errors, "Item " + id + " has invalid answerMode: " + String(item.answerMode || ""));
    }

    if (!Array.isArray(item.sourceRefs)) {
      fail(errors, "Item " + id + " sourceRefs must be an array.");
    }

    if (!Array.isArray(item.contexts)) {
      fail(errors, "Item " + id + " contexts must be an array.");
    }

    if (String(item.status || "") === "active") {
      activeItems.push(item);
    }

    const q = String(item.question || "");
    const a = String(item.answer || "");
    forbiddenTerms.forEach((pattern) => {
      if (pattern.test(q) || pattern.test(a)) {
        fail(errors, "Item " + id + " includes forbidden terminology.");
      }
    });

    const refs = Array.isArray(item.sourceRefs) ? item.sourceRefs : [];
    let hasRouteRef = false;
    let hasPolicyOrPageRef = false;

    refs.forEach((ref, refIdx) => {
      if (!ref || typeof ref !== "object") {
        fail(errors, "Item " + id + " sourceRef " + refIdx + " is invalid.");
        return;
      }
      const type = String(ref.type || "");
      if (!allowedSourceTypes.has(type)) {
        fail(errors, "Item " + id + " sourceRef " + refIdx + " has invalid type: " + type);
        return;
      }
      if (type === "route") {
        hasRouteRef = true;
        const method = String(ref.method || "").toUpperCase();
        const routePath = String(ref.path || "").trim();
        if (!method || !routePath) {
          fail(errors, "Item " + id + " has incomplete route sourceRef.");
        } else if (!knownRoutes.has(method + " " + routePath)) {
          fail(errors, "Item " + id + " references unknown route: " + method + " " + routePath);
        }
      }
      if (type === "policy" || type === "page") {
        hasPolicyOrPageRef = true;
      }
    });

    if (String(item.status || "") === "active" && !hasPolicyOrPageRef) {
      fail(errors, "Item " + id + " must include at least one page or policy sourceRef.");
    }

    const mode = String(item.answerMode || "");
    if (mode === "deterministic" && !hasRouteRef) {
      fail(errors, "Item " + id + " answerMode=deterministic requires at least one route sourceRef.");
    }
    if (mode === "policy_bound" && !hasPolicyOrPageRef) {
      fail(errors, "Item " + id + " answerMode=policy_bound requires page/policy sourceRef.");
    }
    if (mode === "conditional") {
      const requiredInputs = Array.isArray(item.requiredInputs) ? item.requiredInputs : [];
      if (requiredInputs.length === 0) {
        fail(errors, "Item " + id + " answerMode=conditional requires non-empty requiredInputs.");
      }
      if (!/(may|depends|depending on|according to policy|when enabled|if enabled)/i.test(a)) {
        fail(errors, "Item " + id + " answerMode=conditional requires neutral wording in answer.");
      }
    }

    if (String(item.status || "") === "gap") {
      const contexts = Array.isArray(item.contexts) ? item.contexts : [];
      if (contexts.indexOf("hub") >= 0 || contexts.indexOf("contextual") >= 0) {
        fail(errors, "Gap item " + id + " cannot be configured for render contexts.");
      }
    }
  });

  if (activeItems.length !== 43) {
    fail(errors, "Expected 43 active FAQ items but found " + String(activeItems.length) + ".");
  }

  const trustFaqIds = Array.isArray(trustConfig.trustFaqIds) ? trustConfig.trustFaqIds : [];
  if (trustFaqIds.length !== 6) {
    fail(errors, "Trust FAQ subset must contain exactly 6 IDs.");
  }
  trustFaqIds.forEach((id) => {
    if (!byId.has(String(id))) {
      fail(errors, "Trust FAQ ID not found in catalog: " + String(id));
      return;
    }
    const item = byId.get(String(id));
    if (String(item.status || "") !== "active") {
      fail(errors, "Trust FAQ ID must reference active item: " + String(id));
    }
  });

  const placements = trustConfig.contextPlacement && typeof trustConfig.contextPlacement === "object"
    ? trustConfig.contextPlacement
    : {};
  ["checkout", "experience", "host_onboarding", "dashboard_guest", "dashboard_host", "about_platform", "about_trust"].forEach((contextKey) => {
    const ids = placements[contextKey];
    if (!Array.isArray(ids) || ids.length === 0) {
      fail(errors, "Missing trust placement for context: " + contextKey);
    }
  });

  if (errors.length === 0) {
    console.log("FAQ_VALIDATION_PASS");
  } else {
    console.log("FAQ_VALIDATION_FAIL");
    errors.forEach((msg) => console.log("- " + msg));
  }

  warnings.forEach((msg) => console.log("WARN: " + msg));
  return { errors, warnings };
}

const result = main();
if (result.errors.length > 0) process.exit(1);
