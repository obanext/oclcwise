import {
  WISE_DEFAULT_PERSPECTIVE_ID,
  WISE_DEFAULT_SCOPE,
  WISE_DEFAULT_SORT,
} from "./wiseConfig.js";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const SCOPE_ALIASES = {
  anything: "anything",
  any: "anything",
  alles: "anything",
  title: "title",
  titel: "title",
  author: "author",
  auteur: "author",
  subject: "subject",
  onderwerp: "subject",
  series: "series",
  serie: "series",
  reeks: "series",
  occupancy: "occupancy",
};

export function canonicalSearchScope(value) {
  const raw = text(value);
  const normalized = raw
    .toLowerCase()
    .replace(/^search[_ -]?in[_ -]?/, "")
    .replace(/^search[_ -]?scope[_ -]?/, "")
    .replace(/[^a-z]+/g, "");

  return SCOPE_ALIASES[normalized] || raw.toLowerCase();
}

export function extractPerspectives(body = {}) {
  return asArray(body?.perspective)
    .slice()
    .sort((a, b) => Number(a?.sortIndex ?? 0) - Number(b?.sortIndex ?? 0));
}

export function findPerspective(perspectives, requestedId) {
  const requested = text(requestedId || WISE_DEFAULT_PERSPECTIVE_ID);
  return asArray(perspectives).find((entry) => text(entry?.id) === requested) || null;
}

export function perspectiveScopes(perspective = {}) {
  return asArray(perspective?.searchScopes)
    .slice()
    .sort((a, b) => Number(a?.sortIndex ?? 0) - Number(b?.sortIndex ?? 0))
    .map((scope) =>
      canonicalSearchScope(scope?.labelText || scope?.labelKey || scope?.value || scope?.id)
    )
    .filter(Boolean);
}

export function perspectiveSortIds(perspective = {}) {
  return asArray(perspective?.sortings)
    .slice()
    .sort((a, b) => Number(a?.sortIndex ?? 0) - Number(b?.sortIndex ?? 0))
    .map((sorting) => text(sorting?.id))
    .filter(Boolean);
}

export function resolveSearchConfiguration({
  perspectives,
  requestedPerspectiveId,
  requestedScope,
  requestedSort,
  scopeWasProvided = false,
  sortWasProvided = false,
}) {
  const perspective = findPerspective(perspectives, requestedPerspectiveId);

  if (!perspective) {
    return { error: "Onbekende perspectiveId" };
  }

  const scopes = perspectiveScopes(perspective);
  const requestedScopeValue = canonicalSearchScope(requestedScope || WISE_DEFAULT_SCOPE);
  let selectedScope = requestedScopeValue;

  if (!scopes.includes(selectedScope)) {
    if (scopeWasProvided) return { error: "Ongeldige searchScope voor deze perspective" };
    selectedScope = scopes.includes(WISE_DEFAULT_SCOPE) ? WISE_DEFAULT_SCOPE : scopes[0] || WISE_DEFAULT_SCOPE;
  }

  const sortIds = perspectiveSortIds(perspective);
  const requestedSortValue = text(requestedSort || WISE_DEFAULT_SORT);
  let selectedSort = requestedSortValue;

  if (!sortIds.includes(selectedSort)) {
    if (sortWasProvided) return { error: "Ongeldige sortering voor deze perspective" };
    selectedSort = sortIds.includes(WISE_DEFAULT_SORT)
      ? WISE_DEFAULT_SORT
      : sortIds[0] || WISE_DEFAULT_SORT;
  }

  return {
    perspective,
    selectedPerspectiveId: text(perspective.id),
    selectedScope,
    selectedSort,
  };
}
