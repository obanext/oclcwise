import { isNbcPerspective } from "./oclcSearchFilters.js";

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
const MOCKUP_ROUTE = "/api/oclc-search";
const AVAILABILITY_COUNT_ENDPOINT = `${TITLESUMMARY_ENDPOINT}?returnType=count&filterAvailableTitles=true`;

const SORT_PRESENTATION = {
  "2910": { label: "Relevantie", direction: "desc" },
  "2911": { label: "Populariteit", direction: "desc" },
  "2912": { label: "Datum", direction: "desc" },
  "2913": { label: "Auteur", direction: "asc" },
  "2914": { label: "Titel", direction: "asc" },
};

export const OCLC_SEARCH_FACET_DEFINITIONS = [
  { order: 1, name: "mediumTypeCode", labelKey: "LABELKEY-MEDIUM-TYPE-CODE", siteLabel: "Type", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 2, name: "audienceCode", labelKey: "LABELKEY-AUDIENCE-CODE", siteLabel: "Doelgroep", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 3, name: "authorFacet", labelKey: "LABELKEY-AUTHOR-FACET", siteLabel: "Auteur", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 4, name: "genreCode", labelKey: "LABELKEY-GENRE-CODE", siteLabel: "Genre", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 5, name: "subject", labelKey: "LABELKEY-SUBJECT", siteLabel: "Onderwerpen", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 6, name: "languageCode", labelKey: "LABELKEY-LANGUAGE-CODE", siteLabel: "Taal", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 7, name: "publicationYear", labelKey: "LABELKEY-PUBLICATION-YEAR", siteLabel: "Jaar van uitgave", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 8, name: "branchId", labelKey: "LABELKEY-BRANCH-ID", siteLabel: "Waar", group: "Bestaande OBA.nl-filters", obaIst: "WEL" },
  { order: 9, name: "availableNow", labelKey: "LABELKEY-AVAILABLE-NOW", siteLabel: "Beschikbaarheid", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
  { order: 10, name: "fictionNonfictionCode", labelKey: "LABELKEY-FICTION-NONFICTION-CODE", siteLabel: "Fictie/Non Fictie", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
  { order: 11, name: "targetAudienceCode", labelKey: "LABELKEY-TARGET-AUDIENCE-CODE", siteLabel: "Leeftijd / Niveau", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
  { order: 12, name: "series", labelKey: "LABELKEY-SERIES", siteLabel: "Serie", group: "Niet geïmplementeerde filters", obaIst: "NIET" },
];

export function findOclcSearchFacetDefinition(facet = {}) {
  const name = text(facet?.name);
  const labelKey = text(facet?.labelKey);
  const nameAliases = {
    "nbc:carrierOB_key": "mediumTypeCode",
    "nbc:creatorNameProfile1NtaOrTitle_key": "authorFacet",
    "nbc:subjectNbchoofdcategorie_key": "fictionNonfictionCode",
    "nbc:subjectNbdtrefwoorden_key": "subject",
    "nbc:subjectNbdgenre_key": "genreCode",
    "nbc:language_key": "languageCode",
    "nbc:publicationYear_key": "publicationYear",
    "nbc:audienceNbcLeeftijdscategorie_key": "targetAudienceCode",
  };
  return OCLC_SEARCH_FACET_DEFINITIONS.find((definition) => (
    definition.name === (nameAliases[name] || name) || definition.labelKey === labelKey
  ));
}

function searchEndpoint() {
  return TITLESUMMARY_ENDPOINT;
}

function escapeCsv(value) {
  const stringValue = rawText(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function toCsv(rows = [], columns = []) {
  const csv = [
    columns.map(([, label]) => escapeCsv(label)).join(";"),
    ...asArray(rows).map((row) => columns.map(([key]) => escapeCsv(row?.[key])).join(";")),
  ].join("\r\n");
  return `\uFEFF${csv}`;
}

function perspectiveCountEndpoint(perspective = {}) {
  if (perspective.countUrl) return perspective.countUrl;
  const perspectiveId = text(perspective?.id) || "{perspectiveId}";
  return `/branch/{branchId}/perspective/${perspectiveId}/titlesummary?returnType=count&searchScope=anything`;
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
      {
        section: "Resultaat",
        siteField: "Cover",
        oclcField: cover.field,
        value: cover.value,
        note: "De cover-URL wordt rechtstreeks uit de zoekresponse gebruikt. Een NBC+-cover blijft zichtbaar als het resultaat geen numeriek WISE-detail-ID heeft; alleen de detail-link ontbreekt dan.",
      },
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
        oclcField: item?.origin === "NBC_PLUS" ? "items[].id" : "items[].detailId",
        value: item?.detailHref,
        note: item?.origin === "NBC_PLUS"
          ? "Voor een NBC+-luisterboek, e-book of landelijk resultaat wordt de eigen detailroute opgebouwd met het PPN uit items[].id; de detailpagina gebruikt de specifieke NBC+-discoveryendpoint."
          : "Lokale detailroute opgebouwd met de numerieke OCLC-titleId.",
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

  // Include migration instructions in the used-fields download as well.
  buildOclcFilterRows(data).filter((row) => row.group === "Technische conventies").forEach((row) => rows.push({
    order: rows.length + 1, resultIndex: "", detailId: "", section: row.group,
    oclcField: row.oclcField, siteField: row.siteField, obaIst: row.obaIst,
    endpoint: row.endpoint, mockupRoute: row.mockupRoute, value: row.technicalValue, note: row.note,
  }));
  return rows;
}

export function buildOclcFilterRows(data = {}) {
  const rows = [];
  const endpoint = searchEndpoint(data);
  const selectedPerspective = data?.selectedPerspective || asArray(data?.perspectives)[0] || {};

  const appendFacetDefinition = (definition) => {
    const facet = asArray(data?.facets).find((candidate) => (
      findOclcSearchFacetDefinition(candidate)?.name === definition.name
    ));
    const values = asArray(facet?.values);
    if (!facet && isNbcPerspective(selectedPerspective.id, selectedPerspective.backend)) return;

    if (!facet || !values.length) {
      rows.push({
        order: rows.length + 1,
        group: definition.group,
        oclcField: text(facet?.name) || definition.name,
        oclcLabelKey: definition.labelKey,
        oclcLabel: text(facet?.label),
        siteField: definition.siteLabel,
        obaIst: definition.obaIst,
        valueLabel: "",
        siteValueLabel: "",
        technicalValue: "",
        endpoint,
        mockupRoute: MOCKUP_ROUTE,
        note: "Filter of filterwaarden niet aanwezig in de huidige zoekresponse.",
      });
      return;
    }

    values.forEach((value) => {
      const valueLabel = text(value?.raw?.label || value?.label || value?.term);
      const yearMatch = definition.name === "publicationYear"
        ? text(value?.term || valueLabel).match(/(?:18|19|20|21)\d{2}/)
        : null;
      const isNbcFacet = text(facet?.name).startsWith("nbc:");
      const isNbcYear = text(facet?.name) === "nbc:publicationYear_key";
      const siteValueLabel = definition.name === "availableNow"
        ? "Nu aanwezig"
        : yearMatch
          ? yearMatch[0]
          : valueLabel;
      const technicalValue = isNbcYear
        ? text(value?.facetFilter)
        : yearMatch
        ? `customPublicationYear:${yearMatch[0]}`
        : text(value?.facetFilter);
      rows.push({
        order: rows.length + 1,
        group: definition.group,
        oclcField: text(facet?.name) || definition.name,
        oclcLabelKey: text(facet?.labelKey || definition.labelKey),
        oclcLabel: text(facet?.label),
        siteField: definition.siteLabel,
        obaIst: definition.obaIst,
        valueLabel,
        siteValueLabel,
        technicalValue,
        count: value?.count,
        endpoint,
        countEndpoint: definition.name === "availableNow" ? AVAILABILITY_COUNT_ENDPOINT : "",
        mockupRoute: MOCKUP_ROUTE,
        note: definition.name === "availableNow"
          ? "De OCLC-filterwaarde wordt op de site vertaald naar Nu aanwezig. De teller komt uit een aanvullende titlesummary-call met returnType=count en filterAvailableTitles=true; selectie van het filter stuurt filterAvailableTitles=true."
          : isNbcFacet
            ? "NBC+-facet en facetwaarde worden ongewijzigd naar OCLC gestuurd; lokale WISE-veldnamen of codes worden hier niet gebruikt."
          : yearMatch
            ? "Publicatiejaar wordt als viercijferig jaar getoond en als customPublicationYear:<jaar> verstuurd."
            : valueLabel
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
      siteValueLabel: text(perspective?.label),
      technicalValue: text(perspective?.id),
      endpoint: PERSPECTIVE_ENDPOINT,
      count: perspective?.count,
      countEndpoint: perspectiveCountEndpoint(perspective),
      mockupRoute: MOCKUP_ROUTE,
      note: "De actieve bron toont het gefilterde total uit de hoofdresponse. Andere bronnen krijgen returnType=count met dezelfde term, searchScope=anything en zonder facet-, term- of beschikbaarheidsfilters: exact de opdracht bij klikken op die bron. De endpoint-kolom bevat de werkelijke request. Een mislukte of ongeldige count verschijnt als —, nooit als 0 of vervangend totaal.",
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
    siteValueLabel: text(scope?.label),
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
  sortings.filter((sorting) => text(sorting?.label)).forEach((sorting) => {
    const presentation = SORT_PRESENTATION[text(sorting?.id)] || {
      label: text(sorting?.label),
      direction: sorting?.desc ? "desc" : sorting?.asc ? "asc" : "",
    };

    rows.push({
      order: rows.length + 1,
      group: "Sorteren",
      oclcField: sortingsFromSearch ? "sortkeys[].label" : "perspective[].sortings[].label",
      oclcLabelKey: text(sorting?.labelKey),
      oclcLabel: text(sorting?.label),
      siteField: "Sorteren op",
      obaIst: "WEL",
      valueLabel: text(sorting?.label),
      siteValueLabel: presentation.label,
      technicalValue: [text(sorting?.id), presentation.direction].filter(Boolean).join(" "),
      endpoint: sortingsFromSearch ? endpoint : PERSPECTIVE_ENDPOINT,
      mockupRoute: MOCKUP_ROUTE,
      note: `Het ruwe OCLC-label wordt vertaald naar ${presentation.label}; de WISE-call ontvangt sorteercode plus richting.`,
    });
  });

  rows.push({
    order: rows.length + 1,
    group: "Technische conventies",
    oclcField: "perspectiveId; term",
    siteField: "Alles in de collectie",
    obaIst: "WEL",
    technicalValue: "NBC+: term=*; WISE: lege term blijft toegestaan, expliciete wildcard is *.*",
    endpoint,
    countEndpoint: `${TITLESUMMARY_ENDPOINT}?returnType=count&searchScope=anything`,
    mockupRoute: `${MOCKUP_ROUTE}?term=*&perspectiveId=3684&searchScope=anything&sort=2910&page=1`,
    note: "Geen all=1 of q-parameter. NBC+-collectie- en facetlinks gebruiken de native OCLC-zoekterm *. Zonder term geeft accept1 voor deze routes een fout. De zoekbalk blijft leeg bij een collectie-wildcard; URL en request tonen de echte term. E-books gebruiken perspective 3684, luisterboeken 3685: geen extra lokaal formaatfacet. Landelijk: 3687 met nbc:carrierOB_key:<carrierterm>. Taal: nbc:language_key; jaar: nbc:publicationYear_key; genre: nbc:subjectNbdgenre_key; leeftijd: nbc:audienceNbcLeeftijdscategorie_key. Auteur/onderwerp behouden term=<tekst>&searchScope=anything. Uitgever/reeks krijgen zonder bewezen mapping geen zoeklink.",
  });

  rows.push({
    order: rows.length + 1,
    group: "Technische conventies",
    oclcField: "facetFilter",
    siteField: "Combinatie facetfilters",
    obaIst: "WEL",
    technicalValue: "WISE: zelfde facet | (OF), verschillende facetten EN; NBC+: herhaalde facetFilter-parameters (EN)",
    endpoint,
    mockupRoute: MOCKUP_ROUTE,
    note: "utils/oclcSearchFilters.js bouwt de criteria per backend. WISE behoudt de bestaande OF-groepering. NBC+ ontvangt iedere key:term afzonderlijk, exact uit facets[].filterList[]. Twee NBC+-jaarfilters 2013 en 2023 leveren terecht 0 op: beide gelden tegelijk. De geteste |-notatie werkt op accept1 niet als OF en wordt afgewezen; er wordt geen alternatieve OF-notatie verzonnen. Filters van de verkeerde backend worden afgewezen, niet stilzwijgend genegeerd. De nbc:-namespace blijft onderdeel van de sleutel.",
  });

  rows.push({
    order: rows.length + 1,
    group: "Technische conventies",
    oclcField: "termFilter",
    siteField: "Combinatie termfilters",
    obaIst: "WEL",
    technicalValue: "herhaalde termFilter-parameters",
    endpoint,
    mockupRoute: MOCKUP_ROUTE,
    note: "Termfilters worden afzonderlijk en herhaald naar WISE gestuurd, gecombineerd met hoofdterm en facetfilters. Voor NBC+ is deze mapping niet gevalideerd en wordt termFilter afgewezen. Nu aanwezig/filterAvailableTitles is eveneens beperkt tot WISE.",
  });

  rows.push({
    order: rows.length + 1,
    group: "Technische conventies",
    oclcField: "facetFilter | termFilter | filterAvailableTitles",
    siteField: "Actieve filters boven zoekresultaten",
    obaIst: "WEL",
    technicalValue: "URL blijft de bron; verwijderen wist uitsluitend de gekozen parameter en zet page=1",
    endpoint,
    mockupRoute: MOCKUP_ROUTE,
    note: "Iedere selectie is één verwijderbare keuze, ook WISE-waarden uit een gegroepeerde |-URL. × verwijdert alleen die waarde, behoudt term/perspective/scope/sort/overige filters en zet page=1. OCLC-labels worden per bron en filterwaarde in sessionStorage onthouden, ook vanuit NBC+-detail-links. Zonder bekend label blijft de technische waarde zichtbaar. De cache bepaalt nooit criteria en voegt geen URL-parameters toe. Terug/vooruit herstellen selecties. Een onafgemaakte zoektekst verandert de ingediende zoekopdracht niet bij een filteractie. Alleen de response voor de actuele URL mag resultaten bijwerken.",
  });

  rows.push({
    order: rows.length + 1, group: "Technische conventies", oclcField: "perspectiveId; total",
    siteField: "Bron wisselen en tellers", obaIst: "WEL", endpoint, mockupRoute: MOCKUP_ROUTE,
    technicalValue: "actieve bron: gefilterd total; andere bronnen: term + searchScope=anything, filters leeg",
    note: "searchStateForPerspective wordt gebruikt voor navigatie en broncounters. Wisselen behoudt de ingediende term en wist facetfilters, termfilters en beschikbaarheid; scope=anything, sort=2910, page=1. Wildcards volgen de doelbackend. NBC+-filters gaan nooit naar WISE om daar een ongefilterd totaal op te halen. De actieve bron wordt niet dubbel geteld.",
  });
  rows.push({
    order: rows.length + 1, group: "Technische conventies", oclcField: "HTTP-status; total; items",
    siteField: "Fouten onderscheiden van nul resultaten", obaIst: "WEL", endpoint, mockupRoute: MOCKUP_ROUTE,
    technicalValue: "zoekresponse: total >= 0 en resultaatlijst; count: geldig numeriek totaal",
    note: "HTTP 200 met null/lege/ongeldige body is een fout (502), geen nulresultaat. Oorspronkelijke upstreamStatus en request blijven in het call-overzicht. Alleen een geldige response met total=0 toont Geen resultaten. Mislukte broncounters blijven onbekend. Tijdens laden of na een fout verschijnen geen oude resultaten of gefingeerde nul-aantallen.",
  });
  asArray(data?.debug?.calls).forEach((call) => rows.push({
    order: rows.length + 1, group: "Technische conventies", oclcField: "OCLC request", siteField: "Werkelijk uitgevoerde call",
    obaIst: "WEL", technicalValue: text(call?.url), endpoint: text(call?.url), mockupRoute: MOCKUP_ROUTE,
    note: `Status ${call?.status ?? "onbekend"}${call?.upstreamStatus ? `; upstream ${call.upstreamStatus}` : ""}. ${call?.error || ""}`.trim(),
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
  flatten(data?.raw?.availabilityCountResponse ?? null, "availabilityCountResponse", AVAILABILITY_COUNT_ENDPOINT, flattened);

  Object.entries(data?.raw?.perspectiveCountResponses || {}).forEach(([perspectiveId, response]) => {
    const perspective = asArray(data?.perspectives)
      .find((entry) => text(entry?.id) === text(perspectiveId));
    flatten(
      response,
      `perspectiveCountResponses.${perspectiveId}`,
      perspectiveCountEndpoint(perspective),
      flattened
    );
  });

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
    ["siteValueLabel", "Waarde site"],
    ["technicalValue", "Technische filterwaarde"], ["count", "Aantal"],
    ["endpoint", "OCLC endpoint path"], ["countEndpoint", "OCLC count endpoint"],
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
