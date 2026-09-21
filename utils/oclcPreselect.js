import { WISE_DEFAULT_PERSPECTIVE_ID } from "./wiseConfig.js";

// catalog:/branch: are select values only, never OCLC or frontend URL parameters.
export function parsePreselect(value) {
  const match = /^(catalog|branch):(\d+)$/.exec(String(value || ""));
  return match ? { type: match[1], value: match[2] }
    : { type: "catalog", value: WISE_DEFAULT_PERSPECTIVE_ID };
}

export function preselectValue({ perspectiveId = WISE_DEFAULT_PERSPECTIVE_ID, branchId = "" }) {
  return branchId ? `branch:${branchId}` : `catalog:${perspectiveId}`;
}

export function resolvePreselect(value) {
  const selected = parsePreselect(value);
  return {
    perspectiveId: selected.type === "branch" ? WISE_DEFAULT_PERSPECTIVE_ID : selected.value,
    branchId: selected.type === "branch" ? selected.value : "",
  };
}
