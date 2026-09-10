const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const hasValue = (value) => value !== null && value !== undefined && value !== "";

const rawText = (value) => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const PERSPECTIVE_ENDPOINT = "/branch/{branchId}/clienttype/{clientType}/perspective";
const TITLESUMMARY_ENDPOINT = "/branch/{branchId}/perspective/{perspectiveId}/titlesummary";
const SEARCH_ENDPOINT = "/branch/{branchId}/perspective/{perspectiveId}/search";
const MOCKUP_ROUTE = "/api/oclc-search";

export const OCLC_SEARCH_FACET_DEFINITIONS = [
  { order: 1, name: "mediumTypeCode", labelKey: "LABELKEY-MEDIUM-TYPE-CODE", siteLabel: "Type", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 2, name: "audienceCode", labelKey: "LABELKEY-AUDIENCE-CODE", siteLabel: "Doelgroep", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 3, name: "authorFacet", labelKey: "LABELKEY-AUTHOR-FACET", siteLabel: "Auteur", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 4, name: "genreCode", labelKey: "LABELKEY-GENRE-CODE", siteLabel: "Genre", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 5, name: "subject", labelKey: "LABELKEY-SUBJECT", siteLabel: "Onderwerpen", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 6, name: "languageCode", labelKey: "LABELKEY-LANGUAGE-CODE", siteLabel: "Taal", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 7, name: "publicationYear", labelKey: "LABELKEY-PUBLICATION-YEAR", siteLabel: "Jaar van uitgave", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 8, name: "branchId", labelKey: "LABELKEY-BRANCH-ID", siteLabel: "Waar", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 9, name: "availableNow", labelKey: "LABELKEY-AVAILABLE-NOW", siteLabel: "Nu beschikbaar", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
  { order: 10, name: "fictionNonfictionCode", labelKey: "LABELKEY-FICTION-NONFICTION-CODE", siteLabel: "Fictie/Non Fictie", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
  { order: 11, name: "targetAudienceCode", labelKey: "LABELKEY-TARGET-AUDIENCE-CODE", siteLabel: "Leeftijd / Niveau", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
  { order: 12, name: "series", labelKey: "LABELKEY-SERIES", siteLabel: "Serie", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
];

export function findOclcSearchFacetDefinition(facet = {}) {
  const name = text(facet?.name);
  const labelKey = text(facet?.labelKey);
  return OCLC_SEARCH_FACET_DEFINITIONS.find((definition) => (
    definition.name === name || definition.labelKey === labelKey
  ));
}

function searchEndpoint(data = {}) {
  return asArray(data?.selectedTermFilters).length ? SEARCH_ENDPOINT : TITLESUMMARY_ENDPOINT;
}

function escapeCsv(value) {
  const stringValue = rawText(value);
  if (/[",\n\r;]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function toCsv(rows = [], columns = []) {
  return [
    columns.map(([, label]) => escapeCsv(label)).join(";"),
    ...asArray(rows).map((row) => columns.map(([key]) => escapeCsv(row?.[key])).join(";")),
  ].join("\n");
}

function firstSource(candidates = []) {
  return candidates.find((candidate) => hasValue(candidate.value)) || candidates[0] || {};
}

export function buildOclcUsedFieldRows(data = {}) {
  const endpoint = searchEndpoint(data);
  const rows = [];

  asArray(data?.items).forEach((item, index) => {
    const resultIndex = item?.index || index + 1;
    const detailId = text(item?.detailId);
    const title = firstSource([
      { field: "items[].title", value: item?.title },
      { field: "items[].mainTitle", value: item?.mainTitle },
      { field: "items[].childTitleList[0].childTitle", value: item?.childTitleList?.[0]?.childTitle },
    ]);
    const cover = firstSource([
      { field: "items[].imageUrls.medium", value: item?.imageUrls?.medium },
      { field: "items[].imageUrls.small", value: item?.imageUrls?.small },
      { field: "items[].imageUrls.large", value: item?.imageUrls?.large },
    ]);
    const media = firstSource([
      { field: "items[].media.description", value: item?.media?.description },
      { field: "items[].mediumGroup.description", value: item?.mediumGroup?.description },
    ]);
    const summary = firstSource([
      { field: "items[].contents", value: item?.contents },
      { field: "items[].contentsSchoolWise", value: item?.contentsSchoolWise },
    ]);
    const visibleFields = [
      { section: "Resultaat", siteField: "Titel", oclcField: title.field, value: title.value },
      { section: "Resultaat", siteField: "Cover", oclcField: cover.field, value: cover.value },
      { section: "Resultaat", siteField: "Auteur", oclcField: "items[].author.description", value: item?.author?.description },
      { section: "Resultaat", siteField: "Type", oclcField: media.field, value: media.value },
      {
        section: "Resultaatmetadata",
        siteField: "Taal",
        oclcField: "items[].language[].description",
        value: asArray(item?.language).map((entry) => text(entry?.description)).filter(Boolean).join(", "),
        note: "Meerdere zichtbare taalwaarden worden samengevoegd.",
      },
      { section: "Resultaatmetadata", siteField: "Jaar van uitgave", oclcField: "items[].publicationYear", value: item?.publicationYear },
      {
        section: "Resultaatmetadata",
        siteField: "Genre",
        oclcField: "items[].genre[].description",
        value: asArray(item?.genre).map((entry) => text(entry?.description)).filter(Boolean).join(", "),
        note: "Meerdere zichtbare genrewaarden worden samengevoegd.",
      },
      { section: "Resultaatmetadata", siteField: "Onderwerp", oclcField: "items[].subjectPim.description", value: item?.subjectPim?.description },
      { section: "Resultaat", siteField: "Samenvatting", oclcField: summary.field, value: summary.value },
      {
        section: "Navigatie",
        siteField: "Detailpagina",
        oclcField: "items[].detailId",
        value: item?.detailHref,
        note: "Lokale detailroute opgebouwd met de numerieke OCLC-titleId.",
      },
    ];

    visibleFields.filter((row) => hasValue(row.value)).forEach((row) => rows.push({
      order: rows.length + 1,
      resultIndex,
      detailId,
      ...row,
      obaIst: "WEL",
      endpoint,
      mockupRoute: MOCKUP_ROUTE,
      note: row.note || "Ruwe waarde uit de OCLC-zoekresponse.",
    }));
  });

  return rows;
}

export function buildOclcFilterRows(data = {}) {
  const rows = [];
  const endpoint = searchEndpoint(data);
  const selectedPerspective = data?.selectedPerspective || asArray(data?.perspectives)[0] || {};

  const appendFacetDefinition = (definition) => {
    const facet = asArray(data?.facets).find((candidate) => (
      text(candidate?.name) === definition.name || text(candidate?.labelKey) === definition.labelKey
    ));
    const values = asArray(facet?.values);

    if (!facet || !values.length) {
      rows.push({
        order: rows.length + 1,
        group: definition.group,
        oclcField: definition.name,
        oclcLabelKey: definition.labelKey,
        oclcLabel: text(facet?.label),
        siteField: definition.siteLabel,
        obaIst: definition.obaIst,
        valueLabel: "",
        technicalValue: "",
        endpoint,
        mockupRoute: MOCKUP_ROUTE,
        note: "Filter of filterwaarden niet aanwezig in de huidige zoekresponse.",
      });
      return;
    }

    values.forEach((value) => {
      const valueLabel = text(value?.raw?.label);
      rows.push({
        order: rows.length + 1,
        group: definition.group,
        oclcField: definition.name,
        oclcLabelKey: text(facet?.labelKey || definition.labelKey),
        oclcLabel: text(facet?.label),
        siteField: definition.siteLabel,
        obaIst: definition.obaIst,
        valueLabel,
        technicalValue: text(value?.facetFilter),
        endpoint,
        mockupRoute: MOCKUP_ROUTE,
        note: valueLabel
          ? "Zichtbare filterwaarde uitsluitend uit de ruwe OCLC-eigenschap label."
          : "Niet zichtbaar in de interface omdat de ruwe OCLC-eigenschap label ontbreekt.",
      });
    });
  };

  asArray(data?.perspectives)
    .filter((perspective) => text(perspective?.label))
    .forEach((perspective) => rows.push({
      order: rows.length + 1,
      group: "Zoek in",
      oclcField: "perspective[].label",
      oclcLabelKey: text(perspective?.labelKey),
      oclcLabel: text(perspective?.label),
      siteField: "Zoek in",
      obaIst: "WEL",
      valueLabel: text(perspective?.label),
      technicalValue: text(perspective?.id),
      endpoint: PERSPECTIVE_ENDPOINT,
      mockupRoute: MOCKUP_ROUTE,
      note: "Zichtbare waarde uitsluitend uit perspective.label.",
    }));

  OCLC_SEARCH_FACET_DEFINITIONS
    .filter((definition) => definition.obaIst === "WEL")
    .forEach(appendFacetDefinition);

  const scopes = asArray(selectedPerspective?.searchScopes || data?.searchScopes);
  scopes.filter((scope) => text(scope?.label)).forEach((scope) => rows.push({
    order: rows.length + 1,
    group: "Niet geïmplementeerde filters",
    oclcField: "perspective[].searchScopes[].label",
    oclcLabelKey: text(scope?.labelKey),
    oclcLabel: text(scope?.label),
    siteField: "Zoeken op",
    obaIst: "NIET",
    valueLabel: text(scope?.label),
    technicalValue: text(scope?.value || scope?.id),
    endpoint: PERSPECTIVE_ENDPOINT,
    mockupRoute: MOCKUP_ROUTE,
    note: "Zichtbare waarde uitsluitend uit searchScope.label.",
  }));

  OCLC_SEARCH_FACET_DEFINITIONS
    .filter((definition) => definition.obaIst === "NIET")
    .forEach(appendFacetDefinition);

  const sortingsFromSearch = asArray(data?.raw?.searchResponse?.sortkeys).length > 0;
  const sortings = asArray(data?.sortkeys?.length ? data.sortkeys : selectedPerspective?.sortings);
  sortings.filter((sorting) => text(sorting?.label)).forEach((sorting) => rows.push({
    order: rows.length + 1,
    group: "Sorteren",
    oclcField: sortingsFromSearch ? "sortkeys[].label" : "perspective[].sortings[].label",
    oclcLabelKey: text(sorting?.labelKey),
    oclcLabel: text(sorting?.label),
    siteField: "Sorteren op",
    obaIst: "WEL",
    valueLabel: text(sorting?.label),
    technicalValue: text(sorting?.id),
    endpoint: sortingsFromSearch ? endpoint : PERSPECTIVE_ENDPOINT,
    mockupRoute: MOCKUP_ROUTE,
    note: "Zichtbare waarde uitsluitend uit sorting.label.",
  }));

  return rows;
}

function matchingFieldDefinition(path, value) {
  return OCLC_SEARCH_FACET_DEFINITIONS.find((definition) => (
    text(value) === definition.name ||
    text(value) === definition.labelKey ||
    path.includes(definition.name)
  ));
}

function flatten(value, path, endpoint, rows) {
  if (Array.isArray(value)) {
    if (!value.length) rows.push({ path, value: "[]", endpoint });
    value.forEach((entry, index) => flatten(entry, `${path}[${index}]`, endpoint, rows));
    return;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) rows.push({ path, value: "{}", endpoint });
    entries.forEach(([key, entry]) => flatten(entry, path ? `${path}.${key}` : key, endpoint, rows));
    return;
  }

  rows.push({ path, value: rawText(value), endpoint });
}

export function buildOclcAllFieldRows(data = {}) {
  const flattened = [];
  flatten(data?.raw?.perspectiveResponse ?? null, "perspectiveResponse", PERSPECTIVE_ENDPOINT, flattened);
  flatten(data?.raw?.searchResponse ?? null, "searchResponse", searchEndpoint(data), flattened);

  return flattened.map((row, index) => {
    const definition = matchingFieldDefinition(row.path, row.value);
    return {
      order: index + 1,
      oclcField: row.path,
      siteField: definition?.siteLabel || "",
      obaIst: definition?.obaIst || "",
      endpoint: row.endpoint,
      mockupRoute: MOCKUP_ROUTE,
      value: row.value,
      note: definition ? `Filtervertaling: ${definition.name} → ${definition.siteLabel}.` : "Ruw OCLC-veld; geen aanvullende vertaling toegepast.",
    };
  });
}

export function toOclcUsedFieldsCsv(rows = []) {
  return toCsv(rows, [
    ["order", "Volgorde"], ["resultIndex", "Resultaat"], ["detailId", "Detail-ID"],
    ["section", "Onderdeel"], ["oclcField", "OCLC-veldnaam"], ["siteField", "Veldnaam site"],
    ["obaIst", "OBA.nl IST"], ["endpoint", "OCLC endpoint path"], ["mockupRoute", "Mockup-route"],
    ["value", "Waarde"], ["note", "Opmerking"],
  ]);
}

export function toOclcFilterCsv(rows = []) {
  return toCsv(rows, [
    ["order", "Volgorde"], ["group", "Groep"], ["oclcField", "OCLC-veldnaam"],
    ["oclcLabelKey", "OCLC-labelKey"], ["oclcLabel", "OCLC-label"], ["siteField", "Veldnaam site"],
    ["obaIst", "OBA.nl IST"], ["valueLabel", "OCLC-waardelabel"],
    ["technicalValue", "Technische filterwaarde"], ["endpoint", "OCLC endpoint path"],
    ["mockupRoute", "Mockup-route"], ["note", "Opmerking"],
  ]);
}

export function toOclcAllFieldsCsv(rows = []) {
  return toCsv(rows, [
    ["order", "Volgorde"], ["oclcField", "OCLC-veldnaam"], ["siteField", "Veldnaam site"],
    ["obaIst", "OBA.nl IST"], ["endpoint", "OCLC endpoint path"], ["mockupRoute", "Mockup-route"],
    ["value", "Waarde"], ["note", "Opmerking"],
  ]);
}
