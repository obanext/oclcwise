const OCLC_SEARCH_ENDPOINT = "/branch/{branchId}/perspective/{perspectiveId}/titlesummary";

const rows = [
  { field: "Vrij zoeken", inputType: "vrij veld", status: "JA", oclcParameter: "term + searchScope", valuePattern: "term=<tekst>&searchScope=anything", source: "invoer", example: "term=kikker&searchScope=anything", note: "Hoofdzoekterm voor zoeken in alle velden." },
  { field: "Aanwezig", inputType: "checkbox", status: "JA", oclcParameter: "filterAvailableTitles", valuePattern: "true", source: "invoer", example: "filterAvailableTitles=true", note: "Beperkt de resultaten tot beschikbare titels." },
  { field: "OCLC request", inputType: "weergave", status: "JA", oclcParameter: "samengestelde request", valuePattern: "term, searchScope, facetFilter, termFilter en beschikbaarheid", source: "actuele formulierwaarden", example: `${OCLC_SEARCH_ENDPOINT}?term=kikker&searchScope=anything`, note: "Toont direct welke OCLC-request uit de actuele invoer wordt opgebouwd." },
  { field: "Combinatiefilters", inputType: "verwerkingslogica", status: "JA", oclcParameter: "facetFilter / termFilter", valuePattern: "verschillende filters = AND; meerdere waarden binnen hetzelfde facet = | (OR)", source: "actuele formulierwaarden", purpose: "Legt vast hoe meerdere zoekcriteria tot één OCLC-request worden gecombineerd.", example: "facetFilter=mediumTypeCode:BOE&facetFilter=languageCode:DUT|ENG", note: "De frontend geeft de selecties afzonderlijk door. /api/oclc-search groepeert meerdere waarden van hetzelfde facet met |; verschillende facetFilter- en termFilter-criteria blijven afzonderlijke queryparameters en werken gecombineerd." },
  { field: "Titel", inputType: "vrij veld", status: "JA", oclcParameter: "term + searchScope / termFilter", valuePattern: "term=<titel>&searchScope=title | title:<titel>", source: "invoer", example: "term=kikker&searchScope=title", note: "Titel is de hoofdzoekterm wanneer Vrij zoeken leeg is; anders wordt titel als termFilter toegevoegd." },
  { field: "Auteur", inputType: "autocomplete", status: "JA", oclcParameter: "term + searchScope / facetFilter", valuePattern: "term=<auteur>&searchScope=author | authorFacet:<exacte waarde>", source: "OCLC authorFacet", example: "term=velthuijs&searchScope=author | facetFilter=authorFacet:Velthuijs, Max", note: "Auteur alleen gebruikt de auteurscope; in een combinatie wordt de gekozen exacte facetwaarde gebruikt." },
  { field: "Formaat", inputType: "lijst", status: "JA", oclcParameter: "facetFilter", valuePattern: "mediumTypeCode:<code>", source: "data/wise/mediumtypecode.txt", purpose: "Vult de keuzelijst Formaat met OCLC-codes en labels.", sourceCall: "/title/metadatafield/mediumTypeCode/entry", refresh: "Dynamisch ophalen en frequentie: NTB.", example: "facetFilter=mediumTypeCode:BOE", note: "Label en code worden uit het lokale WISE-metadatabestand gelezen." },
  { field: "Bibliotheek", inputType: "lijst", status: "JA", oclcParameter: "facetFilter", valuePattern: "branchId:<id>", source: "data/wise/branch.txt", purpose: "Vult de keuzelijst Bibliotheek met vestigings-ID's en namen.", sourceCall: "/branch?onlyActiveBranchesInLibraryNetwork=true (gepagineerd)", refresh: "Dynamisch ophalen en frequentie: NTB.", example: "facetFilter=branchId:1001", note: "De naam is het label; id is de filterwaarde." },
  { field: "Plaatsingscode (check)", inputType: "vrij veld", status: "CHECK", oclcParameter: "termFilter", valuePattern: "placementCode:<waarde>", source: "invoer", example: "termFilter=placementCode:<waarde>", note: "Beschikbaar om de nog te bevestigen veldmapping te testen." },
  { field: "Jaar", inputType: "jaar", status: "JA", oclcParameter: "facetFilter", valuePattern: "customPublicationYear:<jaar>", source: "invoer", example: "facetFilter=customPublicationYear:2025", note: "Een los jaar; invoer in dit veld wist het jaarbereik." },
  { field: "Jaar van–tot", inputType: "twee gekoppelde jaarvelden", status: "JA", oclcParameter: "facetFilter", valuePattern: "customPublicationYear:<van>-<tot>", source: "invoer", example: "facetFilter=customPublicationYear:2022-2023", note: "Van vult Tot met Van + 1; Tot vult Van met maximaal Tot - 1 en minimaal 0. Invoer wist het losse jaar." },
  { field: "Genre", inputType: "lijst", status: "JA", oclcParameter: "facetFilter", valuePattern: "genreCode:<code>", source: "data/wise/genrecode.txt", purpose: "Vult de keuzelijst Genre met OCLC-codes en labels.", sourceCall: "/title/metadatafield/genreCode/entry", refresh: "Dynamisch ophalen en frequentie: NTB.", example: "facetFilter=genreCode:DE", note: "Label en code worden uit het lokale WISE-metadatabestand gelezen." },
  { field: "Taal", inputType: "lijst", status: "JA", oclcParameter: "facetFilter", valuePattern: "languageCode:<code>", source: "data/wise/languagecode.txt", purpose: "Vult de keuzelijst Taal met OCLC-codes en labels.", sourceCall: "/title/metadatafield/languageCode/entry", refresh: "Dynamisch ophalen en frequentie: NTB.", example: "facetFilter=languageCode:GER", note: "Label en code worden uit het lokale WISE-metadatabestand gelezen." },
  { field: "Onderwerp", inputType: "vrij veld; exclusief", status: "JA", oclcParameter: "term + searchScope", valuePattern: "term=<onderwerp>&searchScope=subject", source: "invoer", purpose: "Zoekt als zelfstandige zoekopdracht in onderwerpen.", example: "term=dieren&searchScope=subject", note: "Een onderwerp is vrije tekst en geen exacte facetwaarde. Daarom wordt het niet als facetFilter opgebouwd en kan het niet met andere zoekcriteria worden gecombineerd; het formulier toont dan een foutmelding." },
  { field: "ISSN (check)", inputType: "vrij veld", status: "CHECK", oclcParameter: "termFilter", valuePattern: "issn:<waarde>", source: "invoer", example: "termFilter=issn:<waarde>", note: "Beschikbaar om de nog te bevestigen veldmapping te testen." },
  { field: "Uitgever (check)", inputType: "vrij veld", status: "CHECK", oclcParameter: "termFilter", valuePattern: "publisher:<waarde>", source: "invoer", example: "termFilter=publisher:<waarde>", note: "Beschikbaar om de nog te bevestigen veldmapping te testen." },
  { field: "ISBN (check)", inputType: "vrij veld", status: "CHECK", oclcParameter: "termFilter", valuePattern: "isbn:<waarde>", source: "invoer", example: "termFilter=isbn:<waarde>", note: "Beschikbaar om de nog te bevestigen veldmapping te testen." },
  { field: "Reeks", inputType: "vrij veld", status: "JA", oclcParameter: "term + searchScope / facetFilter", valuePattern: "term=<reeks>&searchScope=series | series:<exacte waarde>", source: "invoer", example: "term=Tijgerlezen&searchScope=series", note: "Reeks alleen gebruikt de reeksscope; in een combinatie wordt reeks als exacte facetwaarde gebruikt." },
  { field: "Collectie (check)", inputType: "lijst", status: "CHECK", oclcParameter: "", valuePattern: "", source: "nog te bepalen", example: "", note: "Beschikbaar; de OCLC-mapping en vullijst moeten nog worden bepaald." },
  { field: "Jeugd", inputType: "lijst", status: "JA", oclcParameter: "facetFilter", valuePattern: "targetAudienceCode:<code>", source: "data/wise/targetaudiencecode.txt", purpose: "Vult de keuzelijst Jeugd met OCLC-doelgroepcodes en labels.", sourceCall: "/title/metadatafield/targetAudienceCode/entry", refresh: "Dynamisch ophalen en frequentie: NTB.", example: "facetFilter=targetAudienceCode:AB", note: "Label en code worden uit het lokale WISE-metadatabestand gelezen." },
  { field: "Inhoud (check)", inputType: "vrij veld", status: "CHECK", oclcParameter: "termFilter", valuePattern: "content:<waarde>", source: "invoer", example: "termFilter=content:<waarde>", note: "Beschikbaar om de nog te bevestigen veldmapping te testen." },
];

function escapeCsv(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[";\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

export const ADVANCED_SEARCH_MAPPING_ROWS = rows.map((row, index) => ({
  order: index + 1,
  ...row,
  oclcEndpoint: OCLC_SEARCH_ENDPOINT,
}));

export function toAdvancedSearchMappingCsv(mappingRows = ADVANCED_SEARCH_MAPPING_ROWS) {
  const columns = [
    ["order", "Volgorde"], ["field", "Veld"], ["inputType", "Invoer"],
    ["status", "Status"], ["oclcParameter", "OCLC parameter"],
    ["oclcEndpoint", "OCLC endpoint"], ["valuePattern", "Waarde / patroon"],
    ["source", "Bronbestand / invoer"], ["purpose", "Doel bronbestand"],
    ["sourceCall", "OCLC broncall"], ["refresh", "Dynamisch ophalen / frequentie"],
    ["example", "Voorbeeld"], ["note", "Opmerking"],
  ];

  return [
    columns.map(([, label]) => escapeCsv(label)).join(";"),
    ...mappingRows.map((row) => columns.map(([key]) => escapeCsv(row?.[key])).join(";")),
  ].join("\n");
}
