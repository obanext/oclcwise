import Link from "next/link";
import fs from "fs";
import path from "path";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import OclcPreselect, { useOclcPerspectives } from "../components/OclcPreselect";
import { preselectValue } from "../utils/oclcPreselect.js";
import { buildSearchUrl, isNbcPerspective, rememberFacetLabels } from "../utils/oclcSearchFilters.js";
import {
  EMPTY_ADVANCED_FORM, NBC_ADVANCED_FACETS, advancedSourceChange, advancedFacetOptions,
  buildAdvancedSearch, determinePrimarySearch, findAuthorFacetValue, getAuthorFacetOptions,
} from "../utils/oclcAdvancedSearch.js";
import { buildAdvancedSearchMappingRows, toAdvancedSearchMappingCsv } from "../utils/advancedSearchMappingRows";

const text = (value) => String(value ?? "").trim();
const FACET_FIELDS = { formats: "mediumTypeCode", genres: "genreCode", languages: "languageCode", youth: "targetAudienceCode" };

function FacetField({ label, value, options = [], onChange, disabled = false, note = "" }) {
  return (
    <label className={`advanced-field${disabled ? " advanced-field-disabled" : ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">{disabled && note ? note : "Kies een waarde"}</option>
        {options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>
      {note ? <small>{note}</small> : null}
    </label>
  );
}

export default function AdvancedSearchPage({ metadataOptions, branches }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_ADVANCED_FORM);
  const catalogs = useOclcPerspectives();
  const perspective = catalogs.perspectives.find((entry) => entry.id === form.perspectiveId);
  const backend = perspective?.backend || "";
  const nbc = isNbcPerspective(form.perspectiveId, backend);
  const fixedFormat = ["3684", "3685"].includes(form.perspectiveId);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [authorOptions, setAuthorOptions] = useState([]);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorError, setAuthorError] = useState("");
  const [authorCalls, setAuthorCalls] = useState([]);
  const [facetData, setFacetData] = useState({ perspectiveId: "", options: {}, loading: false, error: "", calls: [] });
  const primary = determinePrimarySearch(form);
  const search = useMemo(() => buildAdvancedSearch(form, backend), [form, backend]);
  const options = nbc ? (facetData.perspectiveId === form.perspectiveId ? facetData.options : {}) : metadataOptions;
  const facetsLoading = nbc && (facetData.perspectiveId !== form.perspectiveId || facetData.loading);

  // WISE dictionaries remain file based. NBC+ lists come from the chosen source's
  // actual facets for the primary query, without already selected refinements.
  useEffect(() => {
    if (!nbc) return undefined;
    const controller = new AbortController();
    setFacetData((current) => ({ ...current, loading: true, error: "" }));
    const timeout = window.setTimeout(async () => {
      try {
        const href = buildSearchUrl({ q: primary.term, nextSearchRequested: true,
          nextPerspectiveId: form.perspectiveId, nextSearchScope: primary.searchScope }, { api: true, limit: 1, backend });
        const response = await fetch(href, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Filters ophalen mislukt.");
        if (controller.signal.aborted) return;
        setFacetData((current) => {
          const nextOptions = Object.fromEntries(Object.entries(NBC_ADVANCED_FACETS).map(([group, field]) => {
            const values = advancedFacetOptions(data, field);
            // Keep a chosen label visible when OCLC's current top facet list omits it.
            const selected = current.perspectiveId === form.perspectiveId
              ? (current.options[group] || []).find((option) => option.code === form[FACET_FIELDS[group]]) : null;
            if (selected && !values.some((option) => option.code === selected.code)) values.unshift(selected);
            return [group, values];
          }));
          return { perspectiveId: form.perspectiveId, options: nextOptions, loading: false, error: "", calls: data.debug?.calls || [] };
        });
      } catch (error) {
        if (!controller.signal.aborted) setFacetData((current) => ({
          ...current, perspectiveId: form.perspectiveId, loading: false, error: error.message,
        }));
      }
    }, 400);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [nbc, backend, form.perspectiveId, primary.term, primary.searchScope]);

  useEffect(() => {
    const author = text(form.author);
    setAuthorOptions([]);
    setAuthorError("");
    setAuthorCalls([]);
    if (author.length < 2) { setAuthorLoading(false); return undefined; }
    const controller = new AbortController();
    setAuthorLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const href = buildSearchUrl({ q: author, nextPerspectiveId: form.perspectiveId, nextSearchScope: "author" }, { api: true, backend });
        const response = await fetch(href, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Auteurs ophalen mislukt.");
        if (controller.signal.aborted) return;
        const values = getAuthorFacetOptions(data, nbc);
        setAuthorOptions(values);
        setAuthorCalls(data.debug?.calls || []);
        const exactValue = findAuthorFacetValue(values, author);
        setForm((current) => current.perspectiveId === form.perspectiveId && text(current.author) === author
          ? { ...current, authorFacetValue: exactValue } : current);
      } catch (error) {
        if (!controller.signal.aborted) setAuthorError(error.message);
      } finally {
        if (!controller.signal.aborted) setAuthorLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [form.author, form.perspectiveId, backend, nbc]);

  function changePreselect(value) {
    const next = advancedSourceChange(form, value, catalogs.perspectives);
    setForm(next.form);
    setFormError("");
    setNotice(next.resetCriteria ? "Bron gewijzigd. De uitgebreide zoekvelden zijn gewist; Vrij zoeken is behouden." : "");
    if (next.resetCriteria) {
      setAuthorOptions([]);
      setAuthorCalls([]);
      setFacetData({ perspectiveId: "", options: {}, loading: false, error: "", calls: [] });
    }
  }

  function setField(name, value) {
    setFormError("");
    setForm((current) => ({ ...current, [name]: value }));
  }

  function setYear(name, value) {
    const year = value.replace(/[^\d]/g, "");
    setFormError("");
    setForm((current) => ({ ...current,
      year: name === "year" ? year : "",
      yearFrom: name === "yearFrom" ? year : name === "yearTo" && year ? String(Math.max(0, Number(year) - 1)) : "",
      yearTo: name === "yearTo" ? year : name === "yearFrom" && year ? String(Number(year) + 1) : "",
    }));
  }

  function submit(event) {
    event.preventDefault();
    if (search.error) { setFormError(search.error); return; }
    const labels = Object.entries(FACET_FIELDS).flatMap(([group, field]) => (options[group] || [])
      .map((option) => [nbc ? option.code : `${field}:${option.code}`, option.label]));
    labels.push(...branches.map((branch) => [`branchId:${branch.id}`, branch.name]));
    labels.push(...authorOptions.map((option) => [`${nbc ? "nbc:creatorNameProfile1NtaOrTitle_key" : "authorFacet"}:${option.value}`, option.label]));
    rememberFacetLabels(form.perspectiveId, labels.filter(([filter]) => search.state.nextFacetFilters.includes(filter)));
    setFormError("");
    router.push(search.href);
  }

  function reset() {
    setForm(EMPTY_ADVANCED_FORM);
    setAuthorOptions([]);
    setAuthorError("");
    setAuthorCalls([]);
    setFacetData({ perspectiveId: "", options: {}, loading: false, error: "", calls: [] });
    setFormError("");
    setNotice("");
  }

  function downloadMappingCsv() {
    const rows = buildAdvancedSearchMappingRows({ form, perspective, branches, search,
      calls: [...(catalogs.calls || []), ...authorCalls, ...(nbc ? facetData.calls : [])] });
    const blob = new Blob([toAdvancedSearchMappingCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "uitgebreid-zoeken-oclc-mapping.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }

  function facetField(label, group) {
    const field = FACET_FIELDS[group];
    const sourceFormat = group === "formats" && fixedFormat;
    const values = options[group] || [];
    const unavailable = nbc && !values.length;
    const note = sourceFormat ? `Formaat volgt uit de catalogus: ${perspective?.label || form.perspectiveId}.`
      : facetsLoading ? "Filters laden…"
      : unavailable ? "Geen facetwaarden ontvangen voor deze zoekopdracht." : "";
    return <FacetField label={label} value={form[field]} options={sourceFormat ? [] : values}
      onChange={(value) => setField(field, value)} disabled={sourceFormat || facetsLoading || unavailable} note={note} />;
  }

  function checkField(label, field) {
    return (
      <label className={`advanced-field${nbc ? " advanced-field-disabled" : ""}`}>
        <span>{label} (check)</span>
        <input value={form[field]} onChange={(event) => setField(field, event.target.value)} disabled={nbc} />
        {nbc ? <small>De veldmapping is voor deze bron nog niet gevalideerd.</small> : null}
      </label>
    );
  }

  return (
    <main>
      <div className="header-image"><img src="/header.JPG" alt="OBA" /></div>
      <div className="container advanced-search-page">
        <section className="preselect-intro"><h1>Uitgebreid zoeken</h1></section>
        <form className="old-school-form" onSubmit={submit}>
          <div className="old-school-combined-search">
            <OclcPreselect id="advanced-preselect" value={preselectValue(form)} onChange={changePreselect}
              perspectives={catalogs.perspectives} loading={catalogs.loading} branches={branches}
              branchGroupLabel="Bibliotheken uit branch.txt" />
            <div className="old-school-search-input-wrap">
              <span className="old-school-search-icon" aria-hidden="true">⌕</span>
              <input className="old-school-search-input" value={form.term} aria-label="Vrij zoeken"
                onChange={(event) => setField("term", event.target.value)} placeholder="Waar ben je naar op zoek?" />
            </div>
          </div>
          <label className="old-school-available-toggle" title={nbc ? "Alleen voor lokale WISE-bronnen" : ""}>
            <input type="checkbox" checked={form.available} disabled={nbc}
              onChange={(event) => setField("available", event.target.checked)} />
            <span>Aanwezig</span>
          </label>
          <button className="old-school-submit" type="submit" aria-label="Zoeken">→</button>
        </form>
        {catalogs.error ? <p role="alert">{catalogs.error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {nbc ? <p className="advanced-request-note">Filters horen bij de gekozen bron. Grijze velden zijn voor deze bron niet beschikbaar. De lijsten tonen de facetwaarden die OCLC bij de hoofdzoekterm teruggeeft.</p> : null}
        {nbc && facetData.error ? <p role="alert">{facetData.error}</p> : null}
        {formError ? <p role="alert">{formError}</p> : null}

        <section className="advanced-search-card">
          <label className="advanced-field advanced-query-field">
            <span>OCLC request</span>
            <textarea className="advanced-query-preview" value={search.request || `Nog geen geldige request: ${search.error}`} readOnly />
          </label>
          <form className="advanced-filter-list" onSubmit={submit}>
            <label className="advanced-field">
              <span>Titel</span>
              <input value={form.title} onChange={(event) => setField("title", event.target.value)} />
              {nbc ? <small>Gebruik Titel of Vrij zoeken als hoofdzoekterm; filters kunnen erbij.</small> : null}
            </label>
            <label className="advanced-field">
              <span>Auteur</span>
              <input list="advanced-author-options" value={form.author} autoComplete="off"
                onChange={(event) => {
                  const value = event.target.value;
                  setFormError("");
                  setForm((current) => ({ ...current, author: value,
                    authorFacetValue: findAuthorFacetValue(authorOptions, value) }));
                }} />
              <datalist id="advanced-author-options">
                {authorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </datalist>
              {authorLoading ? <small>Auteurs ophalen…</small> : null}
              {authorError ? <small role="alert">{authorError}</small> : null}
            </label>
            {facetField("Formaat", "formats")}
            <label className={`advanced-field${nbc ? " advanced-field-disabled" : ""}`}>
              <span>Bibliotheek</span>
              <select value={form.branchId} disabled={nbc} onChange={(event) => changePreselect(event.target.value
                ? `branch:${event.target.value}` : `catalog:${form.perspectiveId}`)}>
                <option value="">Kies een waarde</option>
                {branches.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
              <small>{nbc ? "Vestigingsfilters gelden alleen voor lokale WISE-bronnen." : "Gekoppeld aan de voorselectie bovenaan; dezelfde vestiging wordt één keer als filter meegestuurd."}</small>
            </label>
            {checkField("Plaatsingscode", "placementCode")}
            <label className="advanced-field">
              <span>Jaar</span>
              <input inputMode="numeric" value={form.year} min="0" onChange={(event) => setYear("year", event.target.value)} placeholder="bijv. 2022" />
            </label>
            <div className={`advanced-field${nbc ? " advanced-field-disabled" : ""}`}>
              <span>Jaar van–tot</span>
              <div className="advanced-year-range">
                <input inputMode="numeric" value={form.yearFrom} min="0" disabled={nbc}
                  onChange={(event) => setYear("yearFrom", event.target.value)} aria-label="Jaar vanaf" />
                <span>tot</span>
                <input inputMode="numeric" value={form.yearTo} min="0" disabled={nbc}
                  onChange={(event) => setYear("yearTo", event.target.value)} aria-label="Jaar tot" />
              </div>
              {nbc ? <small>Jaarbereik is voor deze bron nog niet gevalideerd. Een los jaar is wel beschikbaar.</small> : null}
            </div>
            {facetField("Genre", "genres")}
            {facetField("Taal", "languages")}
            <label className="advanced-field">
              <span>Onderwerp</span>
              <input value={form.subject} onChange={(event) => setField("subject", event.target.value)} />
            </label>
            {checkField("ISSN", "issn")}
            {checkField("Uitgever", "publisher")}
            {checkField("ISBN", "isbn")}
            <label className="advanced-field">
              <span>Reeks</span>
              <input value={form.series} onChange={(event) => setField("series", event.target.value)} />
              {nbc ? <small>Gebruik Reeks als hoofdzoekterm, eventueel met filters.</small> : null}
            </label>
            <FacetField label="Collectie (check)" value={form.collection} onChange={(value) => setField("collection", value)} disabled={nbc}
              note={nbc ? "Veldmapping nog niet gevalideerd." : ""} />
            {facetField("Jeugd", "youth")}
            {checkField("Inhoud", "content")}
            <div className="advanced-actions">
              <button type="button" className="advanced-clear" onClick={downloadMappingCsv}>Download mapping CSV</button>
              <button type="button" className="advanced-clear" onClick={reset}>Wis</button>
              <button type="submit" className="advanced-submit">Zoek</button>
            </div>
          </form>
        </section>
        <p className="preselect-contact"><Link href="/">Terug naar overzicht</Link></p>
      </div>
    </main>
  );
}

function readMetadataOptions(filename) {
  const filePath = path.join(process.cwd(), "data", "wise", filename);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return (Array.isArray(data?.items) ? data.items : [])
    .map((item) => ({ code: text(item?.code), label: text(item?.value) }))
    .filter((item) => item.code && item.label);
}

function readBranchOptions() {
  const filePath = path.join(process.cwd(), "data", "wise", "branch.txt");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return (Array.isArray(data?.items) ? data.items : [])
    .map((item) => ({ id: text(item?.id), name: text(item?.name || item?.description) }))
    .filter((item) => item.id && item.name)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

export function getStaticProps() {
  return { props: {
    metadataOptions: {
      formats: readMetadataOptions("mediumtypecode.txt"), genres: readMetadataOptions("genrecode.txt"),
      languages: readMetadataOptions("languagecode.txt"), youth: readMetadataOptions("targetaudiencecode.txt"),
    },
    branches: readBranchOptions(),
  } };
}
