import { useEffect, useState } from "react";
import { WISE_DEFAULT_PERSPECTIVE_ID } from "../utils/wiseConfig.js";

export function useOclcPerspectives() {
  const [state, setState] = useState({ perspectives: [], loading: true, error: "", calls: [] });

  useEffect(() => {
    const controller = new AbortController();
    // With no search parameters this API returns perspective metadata only.
    fetch("/api/oclc-search", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Catalogi ophalen mislukt.");
        if (!Array.isArray(data?.perspectives) || !data.perspectives.length) {
          throw new Error("OCLC heeft geen catalogi teruggegeven.");
        }
        if (!controller.signal.aborted) {
          setState({ perspectives: data.perspectives, loading: false, error: "", calls: data.debug?.calls || [] });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ perspectives: [], loading: false, error: error.message, calls: [] });
      });
    return () => controller.abort();
  }, []);

  return state;
}

export default function OclcPreselect({
  id, value, onChange, perspectives = [], loading = false, branches = [],
  branchesLoading = false, branchGroupLabel = "Bibliotheken",
}) {
  return (
    <select id={id} className="old-school-select" value={value}
      onChange={(event) => onChange(event.target.value)} aria-label="Voorselectie catalogus of bibliotheek">
      <optgroup label="Catalogi uit OCLC Wise perspectives">
        {perspectives.length ? perspectives.map((option) => (
          <option key={option.id} value={`catalog:${option.id}`}>{option.label}</option>
        )) : (
          <option value={`catalog:${WISE_DEFAULT_PERSPECTIVE_ID}`}>
            {loading ? "Catalogi laden…" : "In jouw bibliotheek"}
          </option>
        )}
      </optgroup>
      <optgroup label={branchGroupLabel}>
        {branches.map((option) => {
          const id = option.id || option.branchId;
          return <option key={id} value={`branch:${id}`}>{option.name}</option>;
        })}
        {branchesLoading ? <option disabled>Vestigingen laden…</option> : null}
        {!branchesLoading && !branches.length ? <option disabled>Geen vestigingen beschikbaar</option> : null}
      </optgroup>
    </select>
  );
}
