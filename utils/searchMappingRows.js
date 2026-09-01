// Convert optional values to safe CSV text.
const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

// Normalize singleton/array values from OCLC and mapped output.
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// Check whether a source value is present.
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === "object") return Object.values(value).some(hasValue);
  return true;
}

// Escape one CSV cell.
function escapeCsv(value) {
  const stringValue = text(value);
  if (/[",\n\r;]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

// Convert a sample value to compact CSV text.
function sampleValue(value) {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return text(value);

  try {
    const json = JSON.stringify(value);
    return json.length > 500 ? `${json.slice(0, 500)}...` : json;
  } catch {
    return text(value);
  }
}

// Strip host and query parameters from a debug URL.
function endpointName(url = "") {
  const value = text(url);
  if (!value) return "";
  return value.replace(/^https?:\/\/[^/]+\/restapi/, "").split("?")[0];
}

// Find one OCLC call in the debug call list.
function pickCall(raw = {}, pattern = "") {
  return asArray(raw?.debug?.calls).find((call) => text(call?.url).includes(pattern)) || {};
}

// Split imprint into the contract values used for place and publisher.
function parseImprint(value = "") {
  const source = text(value);
  if (!source) return { place: "", publisher: "", year: "" };

  const [placePart = "", ...restParts] = source.split(":");
  const remainder = text(restParts.join(":"));
  const year = remainder.match(/[©\[\(]?(\d{4})[\]\)]?/)?.[1] || "";
  const publisher = text(remainder.replace(/,?\s*[©\[\(]?\d{4}[\]\)]?.*$/, ""));

  return { place: text(placePart), publisher, year };
}

// Return direct when a source exists, otherwise na.
function directStatus(value) {
  return hasValue(value) ? "direct" : "na";
}

// Return afgeleid when source data exists, otherwise na.
function derivedStatus(value) {
  return hasValue(value) ? "afgeleid" : "na";
}

// Resolve direct or derived audience evidence.
function audienceEvidence(title = {}, summary = {}) {
  const direct = title.audience || title.targetGroup;
  if (hasValue(direct)) return { value: direct, status: "direct" };

  const youth = title.youth ?? summary.youth;
  const adult = title.adult ?? summary.adult;
  if (youth === true || adult === true) {
    return { value: { youth, adult }, status: "afgeleid" };
  }

  return { value: "", status: "na" };
}

// Build one documentation row.
function row({
  resultIndex = "",
  label,
  rawXmlPath,
  rawJsonPath,
  endpoint,
  oclcPath,
  mappedPath,
  transformation,
  status,
  note = "",
  oclcValue,
  mappedValue,
}) {
  return {
    resultaat: resultIndex,
    "OBA zoekpagina": label,
    "raw XML ABL pad": rawXmlPath,
    "raw JSON GB pad": rawJsonPath,
    "OCLC endpoint": endpoint,
    "OCLC veldpad": oclcPath,
    "mapped JSON pad": mappedPath,
    transformatie: transformation,
    status,
    opmerking: note,
    "OCLC waarde": sampleValue(oclcValue),
    "mapped waarde": sampleValue(mappedValue),
  };
}

// Build rows that apply once to the complete search response.
function buildGeneralRows(raw, mapped, perspectiveEndpoint, titlesummaryEndpoint) {
  const perspectiveCall = pickCall(raw, "/clienttype/default/perspective");

  return [
    row({
      label: "meta.count",
      rawXmlPath: "aquabrowser.meta.count",
      rawJsonPath: "meta.count._text",
      endpoint: titlesummaryEndpoint,
      oclcPath: "total",
      mappedPath: "meta.count._text",
      transformation: "waarde in _text geplaatst",
      status: directStatus(raw?.searchResponse?.total),
      oclcValue: raw?.searchResponse?.total,
      mappedValue: mapped?.meta?.count?._text,
    }),
    row({
      label: "meta.page",
      rawXmlPath: "aquabrowser.meta.page",
      rawJsonPath: "meta.page._text",
      endpoint: titlesummaryEndpoint,
      oclcPath: "request offset + limit",
      mappedPath: "meta.page._text",
      transformation: "paginanummer berekend uit offset en limit",
      status: "afgeleid",
      oclcValue: { offset: raw?.searchResponse?.offset, limit: raw?.searchResponse?.limit },
      mappedValue: mapped?.meta?.page?._text,
    }),
    row({
      label: "meta.query",
      rawXmlPath: "zoekterm in request/context",
      rawJsonPath: "meta.query._text of requestcontext",
      endpoint: titlesummaryEndpoint,
      oclcPath: "request term",
      mappedPath: "meta.query._text",
      transformation: "waarde in _text geplaatst",
      status: directStatus(raw?.query),
      oclcValue: raw?.query,
      mappedValue: mapped?.meta?.query?._text,
    }),
    row({
      label: "perspectives / zoekdomeinen",
      rawXmlPath: "na",
      rawJsonPath: "na",
      endpoint: perspectiveEndpoint,
      oclcPath: "perspective[].searchScopes[] / perspective[].sortings[]",
      mappedPath: "UI zoekopties",
      transformation: "waarden gebruikt door de zoekinterface",
      status: directStatus(perspectiveCall?.body?.perspective),
      note: "Bron voor zoekdomeinen en sorteeropties.",
      oclcValue: perspectiveCall?.body?.perspective?.[0],
      mappedValue: raw?.perspectives?.[0],
    }),
  ];
}

// Build all mapping rows for one visible search result.
function buildResultRows(entry = {}, result = {}, resultIndex, endpoints) {
  const summary = entry?.titleSummary || {};
  const discovery = entry?.discoveryTitle || {};
  const merged = entry?.title || {};
  const detailId = entry?.resolvedDetailId || entry?.id || merged?.id;
  const sourceId = entry?.sourceId || summary?.id || summary?.frbrkey || merged?.frbrkey;
  const summaryLanguage = asArray(summary?.language)[0] || {};
  const discoveryLanguage = asArray(discovery?.language)[0] || {};
  const language = hasValue(discoveryLanguage) ? discoveryLanguage : summaryLanguage;
  const imprint = parseImprint(discovery?.imprint);
  const publisher = discovery?.publisher || discovery?.publicationDetails || imprint.publisher;
  const place = discovery?.publicationPlace || imprint.place;
  const edition = discovery?.annotationEdition || summary?.edition;
  const collation = discovery?.annotationCollation;
  const summaryText = summary?.contents || summary?.contentsSchoolWise || discovery?.contents;
  const genres = asArray(summary?.genre?.length ? summary.genre : discovery?.genre)
    .map((item) => item?.description || item)
    .filter(Boolean);
  const subjects = asArray(discovery?.subjects).map((item) => item?.description || item).filter(Boolean);
  const series = asArray(discovery?.titleSeries)[0] || {};
  const audience = audienceEvidence(discovery, summary);
  const isbn = asArray(summary?.isbn?.length ? summary.isbn : discovery?.isbn)[0];
  const ppn = asArray(discovery?.ppn)[0];
  const variants = asArray(discovery?.titleVariant);
  const originals = asArray(discovery?.titleOriginalTitle);
  const collaborators = asArray(discovery?.collaborators);

  return [
    row({
      resultIndex,
      label: "results.result[].id",
      rawXmlPath: "aquabrowser.results.result.id",
      rawJsonPath: "results.result[].id",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].childTitleList[0].childTitleId",
      mappedPath: "results.result[].id",
      transformation: "waarde in id._text en id._attributes geplaatst",
      status: directStatus(detailId),
      oclcValue: detailId,
      mappedValue: result?.id,
    }),
    row({
      resultIndex,
      label: "results.result[].detail-page",
      rawXmlPath: "aquabrowser.results.result.detail-page",
      rawJsonPath: "results.result[].detail-page._text",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].childTitleList[0].childTitleId",
      mappedPath: "results.result[].detail-page._text",
      transformation: "interne link opgebouwd uit de detail-id",
      status: derivedStatus(detailId),
      oclcValue: detailId,
      mappedValue: result?.["detail-page"]?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].coverimages.coverimage",
      rawXmlPath: "aquabrowser.results.result.coverimages.coverimage",
      rawJsonPath: "results.result[].coverimages.coverimage._text",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].imageUrls.small",
      mappedPath: "results.result[].coverimages.coverimage._text",
      transformation: "waarde in _text geplaatst",
      status: directStatus(summary?.imageUrls?.small || discovery?.imageUrls?.small),
      oclcValue: summary?.imageUrls?.small || discovery?.imageUrls?.small,
      mappedValue: result?.coverimages?.coverimage?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].titles.title",
      rawXmlPath: "aquabrowser.results.result.titles.title",
      rawJsonPath: "results.result[].titles.title._text",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].title / items[].mainTitle",
      mappedPath: "results.result[].titles.title._text",
      transformation: "eerste aanwezige titelveld in _text geplaatst",
      status: directStatus(summary?.title || summary?.mainTitle),
      oclcValue: summary?.title || summary?.mainTitle,
      mappedValue: result?.titles?.title?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].titles.short-title",
      rawXmlPath: "aquabrowser.results.result.titles.short-title",
      rawJsonPath: "results.result[].titles.short-title._text",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].mainTitle / items[].title",
      mappedPath: "results.result[].titles.short-title._text",
      transformation: "eerste aanwezige titelveld in _text geplaatst",
      status: directStatus(summary?.mainTitle || summary?.title),
      oclcValue: summary?.mainTitle || summary?.title,
      mappedValue: result?.titles?.["short-title"]?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].titles.other-title",
      rawXmlPath: "aquabrowser.results.result.titles.other-title",
      rawJsonPath: "results.result[].titles.other-title",
      endpoint: endpoints.discovery,
      oclcPath: "titleVariant[]",
      mappedPath: "results.result[].titles.other-title",
      transformation: "iedere titelvariant in een titelobject geplaatst",
      status: directStatus(variants),
      oclcValue: variants,
      mappedValue: result?.titles?.["other-title"],
    }),
    row({
      resultIndex,
      label: "results.result[].titles.origin-title",
      rawXmlPath: "aquabrowser.results.result.titles.origin-title",
      rawJsonPath: "results.result[].titles.origin-title",
      endpoint: endpoints.discovery,
      oclcPath: "titleOriginalTitle[]",
      mappedPath: "results.result[].titles.origin-title",
      transformation: "iedere oorspronkelijke titel in een titelobject geplaatst",
      status: directStatus(originals),
      oclcValue: originals,
      mappedValue: result?.titles?.["origin-title"],
    }),
    row({
      resultIndex,
      label: "results.result[].authors.main-author",
      rawXmlPath: "aquabrowser.results.result.authors.main-author",
      rawJsonPath: "results.result[].authors.main-author._text",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].author.description",
      mappedPath: "results.result[].authors.main-author._text",
      transformation: "waarde in _text geplaatst",
      status: directStatus(summary?.author?.description || discovery?.author?.description),
      oclcValue: summary?.author?.description || discovery?.author?.description,
      mappedValue: result?.authors?.["main-author"]?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].authors.main-author._attributes",
      rawXmlPath: "aquabrowser.results.result.authors.main-author/@firstname|@lastname|@type",
      rawJsonPath: "results.result[].authors.main-author._attributes",
      endpoint: endpoints.discovery,
      oclcPath: "author.description / author.addition / author.type",
      mappedPath: "results.result[].authors.main-author._attributes",
      transformation: "naam opgesplitst en rolvelden geplaatst",
      status: derivedStatus(discovery?.author || summary?.author),
      oclcValue: discovery?.author || summary?.author,
      mappedValue: result?.authors?.["main-author"]?._attributes,
    }),
    row({
      resultIndex,
      label: "results.result[].authors.author",
      rawXmlPath: "aquabrowser.results.result.authors.author",
      rawJsonPath: "results.result[].authors.author",
      endpoint: endpoints.discovery,
      oclcPath: "collaborators[]",
      mappedPath: "results.result[].authors.author",
      transformation: "iedere bijdrager in een auteur-object geplaatst",
      status: directStatus(collaborators),
      oclcValue: collaborators,
      mappedValue: result?.authors?.author,
    }),
    row({
      resultIndex,
      label: "results.result[].formats.format",
      rawXmlPath: "aquabrowser.results.result.formats.format",
      rawJsonPath: "results.result[].formats.format",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].media",
      mappedPath: "results.result[].formats.format",
      transformation: "mediawaarden in format-object geplaatst",
      status: directStatus(summary?.media || discovery?.media),
      oclcValue: summary?.media || discovery?.media,
      mappedValue: result?.formats?.format,
    }),
    row({
      resultIndex,
      label: "results.result[].publication.year",
      rawXmlPath: "aquabrowser.results.result.publication.year",
      rawJsonPath: "results.result[].publication.year._text",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].publicationYear",
      mappedPath: "results.result[].publication.year._text",
      transformation: "waarde in _text geplaatst",
      status: directStatus(summary?.publicationYear || discovery?.publicationYear),
      oclcValue: summary?.publicationYear || discovery?.publicationYear,
      mappedValue: result?.publication?.year?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].publication.publishers.publisher",
      rawXmlPath: "aquabrowser.results.result.publication.publishers.publisher",
      rawJsonPath: "results.result[].publication.publishers.publisher._text",
      endpoint: endpoints.discovery,
      oclcPath: "imprint",
      mappedPath: "results.result[].publication.publishers.publisher._text",
      transformation: "uitgever uit imprint gesplitst",
      status: derivedStatus(discovery?.imprint || discovery?.publisher),
      oclcValue: discovery?.imprint || discovery?.publisher,
      mappedValue: result?.publication?.publishers?.publisher?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].publication.publishers.publisher._attributes.place",
      rawXmlPath: "aquabrowser.results.result.publication.publishers.publisher/@place",
      rawJsonPath: "results.result[].publication.publishers.publisher._attributes.place",
      endpoint: endpoints.discovery,
      oclcPath: "imprint",
      mappedPath: "results.result[].publication.publishers.publisher._attributes.place",
      transformation: "plaats uit imprint gesplitst",
      status: derivedStatus(discovery?.imprint || place),
      oclcValue: discovery?.imprint || place,
      mappedValue: result?.publication?.publishers?.publisher?._attributes?.place,
    }),
    row({
      resultIndex,
      label: "results.result[].publication.editions.edition",
      rawXmlPath: "aquabrowser.results.result.publication.editions.edition",
      rawJsonPath: "results.result[].publication.editions.edition._text",
      endpoint: `${endpoints.discovery} | ${endpoints.titlesummary}`,
      oclcPath: "annotationEdition / items[].edition",
      mappedPath: "results.result[].publication.editions.edition._text",
      transformation: "eerste aanwezige editiewaarde in _text geplaatst",
      status: directStatus(edition),
      oclcValue: edition,
      mappedValue: result?.publication?.editions?.edition?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].languages.language",
      rawXmlPath: "aquabrowser.results.result.languages.language",
      rawJsonPath: "results.result[].languages.language",
      endpoint: endpoints.discovery,
      oclcPath: "language[0]",
      mappedPath: "results.result[].languages.language",
      transformation: "taalwaarden in language-object geplaatst",
      status: directStatus(language),
      oclcValue: language,
      mappedValue: result?.languages?.language,
    }),
    row({
      resultIndex,
      label: "results.result[].description.pages",
      rawXmlPath: "aquabrowser.results.result.description.pages",
      rawJsonPath: "results.result[].description.pages._text",
      endpoint: endpoints.discovery,
      oclcPath: "annotationCollation",
      mappedPath: "results.result[].description.pages._text",
      transformation: "paginadeel uit annotationCollation gesplitst",
      status: derivedStatus(collation),
      oclcValue: collation,
      mappedValue: result?.description?.pages?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].description.physical-description",
      rawXmlPath: "aquabrowser.results.result.description.physical-description",
      rawJsonPath: "results.result[].description.physical-description._text",
      endpoint: endpoints.discovery,
      oclcPath: "annotationCollation",
      mappedPath: "results.result[].description.physical-description._text",
      transformation: "waarde in _text geplaatst",
      status: directStatus(collation),
      oclcValue: collation,
      mappedValue: result?.description?.["physical-description"]?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].summaries.summary",
      rawXmlPath: "aquabrowser.results.result.summaries.summary",
      rawJsonPath: "results.result[].summaries.summary._text",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].contents / items[].contentsSchoolWise",
      mappedPath: "results.result[].summaries.summary._text",
      transformation: "eerste aanwezige samenvattingswaarde in _text geplaatst",
      status: directStatus(summaryText),
      oclcValue: summaryText,
      mappedValue: result?.summaries?.summary?._text,
    }),
    row({
      resultIndex,
      label: "results.result[].genres.genre",
      rawXmlPath: "aquabrowser.results.result.genres.genre",
      rawJsonPath: "results.result[].genres.genre",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].genre[].description",
      mappedPath: "results.result[].genres.genre",
      transformation: "iedere genreomschrijving in een genre-object geplaatst",
      status: directStatus(genres),
      oclcValue: genres,
      mappedValue: result?.genres?.genre,
    }),
    row({
      resultIndex,
      label: "results.result[].subjects.topical-subject",
      rawXmlPath: "aquabrowser.results.result.subjects.topical-subject",
      rawJsonPath: "results.result[].subjects.topical-subject",
      endpoint: endpoints.discovery,
      oclcPath: "subjects[].description",
      mappedPath: "results.result[].subjects.topical-subject",
      transformation: "ieder onderwerp in een topical-subject-object geplaatst",
      status: directStatus(subjects),
      oclcValue: subjects,
      mappedValue: result?.subjects?.["topical-subject"],
    }),
    row({
      resultIndex,
      label: "results.result[].target-audiences.target-audience",
      rawXmlPath: "aquabrowser.results.result.target-audiences.target-audience",
      rawJsonPath: "results.result[].target-audiences.target-audience",
      endpoint: endpoints.discovery,
      oclcPath: "audience / targetGroup / youth + adult",
      mappedPath: "results.result[].target-audiences.target-audience",
      transformation:
        audience.status === "afgeleid"
          ? "doelgroep afgeleid uit youth/adult"
          : "doelgroepwaarden in contractobject geplaatst",
      status: audience.status,
      oclcValue: audience.value,
      mappedValue: result?.["target-audiences"]?.["target-audience"],
    }),
    row({
      resultIndex,
      label: "results.result[].series.series-title",
      rawXmlPath: "aquabrowser.results.result.series.series-title",
      rawJsonPath: "results.result[].series.series-title",
      endpoint: endpoints.discovery,
      oclcPath: "titleSeries[0]",
      mappedPath: "results.result[].series.series-title",
      transformation: "reekswaarden in series-title-object geplaatst",
      status: directStatus(series),
      oclcValue: series,
      mappedValue: result?.series?.["series-title"],
    }),
    row({
      resultIndex,
      label: "results.result[].identifiers.isbn-id",
      rawXmlPath: "aquabrowser.results.result.identifiers.isbn-id",
      rawJsonPath: "results.result[].identifiers.isbn-id",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].isbn[0]",
      mappedPath: "results.result[].identifiers.isbn-id",
      transformation: "eerste ISBN in identifier-object geplaatst",
      status: directStatus(isbn),
      oclcValue: isbn,
      mappedValue: result?.identifiers?.["isbn-id"],
    }),
    row({
      resultIndex,
      label: "results.result[].identifiers.ppn-id",
      rawXmlPath: "aquabrowser.results.result.identifiers.ppn-id",
      rawJsonPath: "results.result[].identifiers.ppn-id",
      endpoint: endpoints.discovery,
      oclcPath: "ppn[0]",
      mappedPath: "results.result[].identifiers.ppn-id",
      transformation: "eerste PPN in identifier-object geplaatst",
      status: directStatus(ppn),
      oclcValue: ppn,
      mappedValue: result?.identifiers?.["ppn-id"],
    }),
    row({
      resultIndex,
      label: "results.result[].frabl",
      rawXmlPath: "aquabrowser.results.result.frabl",
      rawJsonPath: "results.result[].frabl",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].id / items[].frbrkey",
      mappedPath: "results.result[].frabl",
      transformation: "FRBR-id in contractobject geplaatst",
      status: directStatus(sourceId),
      oclcValue: sourceId,
      mappedValue: result?.frabl,
    }),
    row({
      resultIndex,
      label: "results.result[].undup-info",
      rawXmlPath: "aquabrowser.results.result.undup-info",
      rawJsonPath: "results.result[].undup-info",
      endpoint: endpoints.titlesummary,
      oclcPath: "items[].id / items[].childTitleList[] / title / author",
      mappedPath: "results.result[].undup-info",
      transformation: "contractobject samengesteld uit groepsgegevens",
      status: derivedStatus(sourceId || summary?.childTitleList),
      oclcValue: { sourceId, childTitleList: summary?.childTitleList },
      mappedValue: result?.["undup-info"],
    }),
  ];
}

// Build search mapping documentation for all results on the current page.
export function buildSearchMappingRows(raw = {}, mapped = {}) {
  const perspectiveCall = pickCall(raw, "/clienttype/default/perspective");
  const titlesummaryCall = pickCall(raw, "/titlesummary");
  const perspectiveEndpoint =
    endpointName(perspectiveCall?.url) || "/branch/{branchId}/clienttype/default/perspective";
  const titlesummaryEndpoint =
    endpointName(titlesummaryCall?.url) || "/branch/{branchId}/perspective/{perspectiveId}/titlesummary";
  const discoveryEndpoint = "/discovery/title/{id}";

  const sourceEntries = asArray(raw?.titles);
  const mappedResults = asArray(mapped?.results?.result);
  const resultRows = sourceEntries.flatMap((entry, index) =>
    buildResultRows(entry, mappedResults[index] || {}, index + 1, {
      titlesummary: titlesummaryEndpoint,
      discovery: discoveryEndpoint,
    })
  );

  return [
    ...buildGeneralRows(raw, mapped, perspectiveEndpoint, titlesummaryEndpoint),
    ...resultRows,
  ];
}

// Convert search mapping rows to a downloadable CSV.
export function toSearchMappingCsv(rows = []) {
  const headers = [
    "resultaat",
    "OBA zoekpagina",
    "raw XML ABL pad",
    "raw JSON GB pad",
    "OCLC endpoint",
    "OCLC veldpad",
    "mapped JSON pad",
    "transformatie",
    "status",
    "opmerking",
    "OCLC waarde",
    "mapped waarde",
  ];

  return [
    headers.join(";"),
    ...asArray(rows).map((item) =>
      headers.map((header) => escapeCsv(item?.[header])).join(";")
    ),
  ].join("\n");
}
