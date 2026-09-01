import { WISE_BASE_URL, WISE_BRANCH_ID, WISE_DEFAULT_SCOPE } from "./wiseConfig.js";
import { canonicalSearchScope } from "./wisePerspective.js";
import { fetchWiseResponse } from "./wiseResponse.js";

const VALID_SCOPES = new Set(["anything", "title", "author", "subject", "series", "occupancy"]);

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

export async function fetchWiseSuggestions(term, searchScope) {
  const query = text(term);
  const scope = canonicalSearchScope(searchScope || WISE_DEFAULT_SCOPE);

  if (query.length < 2) {
    return { ok: true, status: 200, suggestions: [], call: null };
  }

  if (!VALID_SCOPES.has(scope)) {
    return { ok: false, status: 400, error: "Ongeldige searchScope voor suggesties", suggestions: [] };
  }

  const url =
    `${WISE_BASE_URL}/branch/${encodeURIComponent(WISE_BRANCH_ID)}/searchsuggestion` +
    `?term=${encodeURIComponent(query)}` +
    `&searchScope=${encodeURIComponent(scope.toUpperCase())}`;
  const call = await fetchWiseResponse(url);

  const suggestions = asArray(call.body)
    .map((item) => ({
      id: text(item?.id),
      term: text(item?.term),
      scope: text(item?.scope || scope).toUpperCase(),
    }))
    .filter((item) => item.term);

  return {
    ok: call.ok,
    status: call.status,
    error: call.error,
    suggestions,
    call,
  };
}
