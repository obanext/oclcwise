import { WISE_BASE_URL, WISE_BRANCH_ID, WISE_CLIENT_TYPE, WISE_DEFAULT_PERSPECTIVE_ID } from "./wiseConfig.js";
import { isNbcPerspective } from "./oclcSearchFilters.js";
import { EMPTY_ADVANCED_FORM, buildAdvancedSearch } from "./oclcAdvancedSearch.js";

const OCLC_SEARCH_ENDPOINT = "/branch/{branchId}/perspective/{perspectiveId}/titlesummary";

const rows = [
  { field: "Voorselectie (old-school)", inputType: "lijst: catalogi en bibliotheken", status: "JA", oclcParameter: "perspectiveId / facetFilter=branchId:<id>", valuePattern: "catalogus: perspectiveId=<id>; bibliotheek: perspectiveId=3682&facetFilter=branchId:<id>", source: "OCLC perspective-response + data/wise/branch.txt", purpose: "Kiest de bron waarbinnen alle ingevulde uitgebreide zoekcriteria worden uitgevoerd.", sourceCall: "/branch/{branchId}/clienttype/{clientType}/perspective", refresh: "Catalogi bij openen ophalen. branch.txt: dynamisch ophalen en frequentie NTB.", example: "perspectiveId=3682&term=kikker&facetFilter=branchId:1001&facetFilter=mediumTypeCode:BOE", note: "Gedeelde component met old-school-search. Catalogus-ID, label en backend komen uit OCLC. In uitgebreid zoeken gebruiken de voorselectie en Bibliotheek dezelfde branch.txt-lijst en één branchId-waarde. Een vestigingskeuze kiest de lokale standaardperspective; de API-branch in het pad blijft 1000. catalog:/branch: zijn uitsluitend interne selectwaarden en worden nooit URL-parameters. Old-school-search behoudt zijn live CG0-vestigingslijst via /api/wise-branches; dit is een andere gegevensbron dan branch.txt." },
  { field: "Vrij zoeken", inputType: "vrij veld", status: "JA", oclcParameter: "term + searchScope", valuePattern: "term=<tekst>&searchScope=anything", source: "invoer", example: "term=kikker&searchScope=anything", note: "Hoofdzoekterm voor zoeken in alle velden." },
  { field: "Aanwezig", inputType: "checkbox", status: "JA", oclcParameter: "filterAvailableTitles", valuePattern: "true", source: "invoer", example: "filterAvailableTitles=true", note: "Beperkt de resultaten tot beschikbare titels." },
  { field: "OCLC request", inputType: "weergave", status: "JA", oclcParameter: "samengestelde request", valuePattern: "term, searchScope, facetFilter, termFilter en beschikbaarheid", source: "actuele formulierwaarden", example: `${OCLC_SEARCH_ENDPOINT}?term=kikker&searchScope=anything`, note: "Toont direct welke OCLC-request uit de actuele invoer wordt opgebouwd." },
  { field: "Combinatiefilters", inputType: "verwerkingslogica", status: "JA", oclcParameter: "facetFilter / termFilter", valuePattern: "WISE: verschillende filters = AND; hetzelfde facet = | (OR). NBC+: herhaalde facetFilter = AND.", source: "actuele formulierwaarden", purpose: "Legt vast hoe voorselectie en zoekcriteria tot één OCLC-request worden gecombineerd.", example: "facetFilter=mediumTypeCode:BOE&facetFilter=languageCode:DUT", note: "De voorselectie bepaalt perspectiveId en backend. WISE gebruikt lokale codes; NBC+ gebruikt exact de key:term-paren uit de gekozen bron, zonder |-samenvoeging. Hoofdzoekterm: Onderwerp (exclusief), anders Vrij zoeken, Titel, Auteur, Reeks. De overige ondersteunde velden worden filters. Beide zoekknoppen gebruiken dezelfde opbouw. De zoekpagina toont elke selectie afzonderlijk verwijderbaar. Het formulier biedt één keuze per facet; de resultatenpagina ondersteunt meerdere selecties volgens de backendconventie." },
  { field: "Titel", inputType: "vrij veld", status: "JA", oclcParameter: "term + searchScope / termFilter", valuePattern: "term=<titel>&searchScope=title | title:<titel>", source: "invoer", example: "term=kikker&searchScope=title", note: "Titel is de hoofdzoekterm wanneer Vrij zoeken leeg is; anders wordt titel als termFilter toegevoegd." },
  { field: "Auteur", inputType: "autocomplete", status: "JA", oclcParameter: "term + searchScope / facetFilter", valuePattern: "term=<auteur>&searchScope=author | authorFacet:<exacte waarde>", source: "OCLC authorFacet", example: "term=velthuijs&searchScope=author | facetFilter=authorFacet:Velthuijs, Max", note: "Auteur alleen gebruikt de auteurscope; in een combinatie wordt de gekozen exacte facetwaarde gebruikt." },
  { field: "Formaat", inputType: "lijst", status: "JA", oclcParameter: "facetFilter", valuePattern: "mediumTypeCode:<code>", source: "data/wise/mediumtypecode.txt", purpose: "Vult de keuzelijst Formaat met OCLC-codes en labels.", sourceCall: "/title/metadatafield/mediumTypeCode/entry", refresh: "Dynamisch ophalen en frequentie: NTB.", example: "facetFilter=mediumTypeCode:BOE", note: "Label en code worden uit het lokale WISE-metadatabestand gelezen." },
  { field: "Bibliotheek", inputType: "lijst", status: "JA", oclcParameter: "facetFilter", valuePattern: "branchId:<id>", source: "data/wise/branch.txt", purpose: "Vult zowel Bibliotheek als de vestigingen in de voorselectie met dezelfde ID's en namen.", sourceCall: "/branch?onlyActiveBranchesInLibraryNetwork=true (gepagineerd)", refresh: "Dynamisch ophalen en frequentie: NTB.", example: "facetFilter=branchId:1001", note: "De naam is het label; id is de filterwaarde. Wijzigen synchroniseert beide keuzelijsten en kiest de lokale standaardperspective. branchId wordt één keer als facetFilter opgenomen. Een cataloguskeuze wist de vestigingskeuze. Alleen voor WISE-bronnen." },
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
  { field: "Download mapping CSV", inputType: "knop", status: "JA", source: "actuele formulierwaarden en laatste bronresponses", note: "Downloadt deze documentatie in schermvolgorde, inclusief gekozen bron, actuele waarden, voorbereide request en werkelijk uitgevoerde calls voor catalogi, auteurs en NBC+-vullijsten. De hoofdzoekopdracht wordt pas na Zoek uitgevoerd. UTF-8 met BOM en puntkomma als scheidingsteken." },
  { field: "Wis", inputType: "knop", status: "JA", source: "formulier", note: "Wist alle criteria en zet de voorselectie terug op de lokale standaardperspective. Applicatiegedrag; geen OCLC-conventie." },
  { field: "Zoek", inputType: "knop", status: "JA", oclcParameter: "term, perspectiveId, searchScope, facetFilter, termFilter", source: "formulier", note: "Navigatie naar /oclc-search met page=1 en sort=2910. De API bouwt het OCLC titlesummary-pad, gebruikt sort=2910 desc, offset=0 en limit=20. Geen q, all of presel-parameter. Een lege hoofdzoekterm wordt bij NBC+ term=*; bij WISE wordt term weggelaten. Validatiefouten stoppen navigatie en worden getoond." },
  { field: "Bronwisseling: formuliergedrag", inputType: "instructie voor ontwikkelaar", status: "JA", source: "utils/oclcAdvancedSearch.js", note: "Binnen WISE blijven de uitgebreide criteria staan; een cataloguskeuze wist branchId. Bij wisselen van/naar of tussen NBC+-perspectives worden alle uitgebreide criteria gewist, omdat de facetwaarden bronafhankelijk zijn. Vrij zoeken blijft behouden. Dit wordt op het scherm gemeld. Dit is een expliciete applicatiekeuze, geen OCLC-regel. De aparte resultatenpagina heeft eigen bronwisselgedrag en documenteert dat in haar CSV." },
];

const FORM_KEYS = { "Vrij zoeken": "term", Titel: "title", Auteur: "author", Formaat: "mediumTypeCode", Bibliotheek: "branchId",
  "Plaatsingscode (check)": "placementCode", Jaar: "year", Genre: "genreCode", Taal: "languageCode", Onderwerp: "subject",
  "ISSN (check)": "issn", "Uitgever (check)": "publisher", "ISBN (check)": "isbn", Reeks: "series",
  "Collectie (check)": "collection", Jeugd: "targetAudienceCode", "Inhoud (check)": "content" };

const NBC_FIELDS = {
  Formaat: "nbc:carrierOB_key", Genre: "nbc:subjectNbdgenre_key", Taal: "nbc:language_key",
  Jeugd: "nbc:audienceNbcLeeftijdscategorie_key",
};

export function buildAdvancedSearchMappingRows({ form = EMPTY_ADVANCED_FORM, perspective, branches = [], search, calls = [] } = {}) {
  const nbc = isNbcPerspective(form.perspectiveId, perspective?.backend);
  const built = search || buildAdvancedSearch(form, perspective?.backend);
  const endpoint = `${WISE_BASE_URL}/branch/${WISE_BRANCH_ID}/perspective/${form.perspectiveId}/titlesummary`;
  const branch = branches.find((entry) => entry.id === form.branchId);
  const selected = form.branchId ? `${branch?.name || form.branchId} (branchId=${form.branchId}, perspectiveId=${form.perspectiveId})`
    : `${perspective?.label || form.perspectiveId} (perspectiveId=${form.perspectiveId})`;
  const mapping = rows.map((row) => ({ ...row, oclcEndpoint: endpoint,
    backend: nbc ? "nbcplus" : "wise", currentValue: form[FORM_KEYS[row.field]] ?? "" }));
  const update = (field, values) => Object.assign(mapping.find((row) => row.field === field), values);
  update("Voorselectie (old-school)", {
    currentValue: selected,
    sourceCall: `${WISE_BASE_URL}/branch/${WISE_BRANCH_ID}/clienttype/${WISE_CLIENT_TYPE}/perspective`,
    valuePattern: `catalogus: perspectiveId=<id>; bibliotheek: perspectiveId=${WISE_DEFAULT_PERSPECTIVE_ID}&facetFilter=branchId:<id>`,
    note: `${rows[0].note} Alleen de voorselectie is gedeeld: het eenvoudige old-school-zoekveld gebruikt searchScope=title; Vrij zoeken hier gebruikt anything en Titel gebruikt title.`,
  });
  update("Aanwezig", { currentValue: String(form.available) });
  update("OCLC request", { currentValue: built.request, example: "", frontendUrl: built.href,
    note: built.error ? `Nog niet geldig: ${built.error}` : "Voorbereide hoofdrequest uit de actuele formulierwaarden; nog niet uitgevoerd. De werkelijke zoekcalls staan na zoeken in de CSV van de resultatenpagina." });
  update("Jaar van–tot", { currentValue: form.yearFrom || form.yearTo ? `${form.yearFrom}–${form.yearTo}` : "" });
  update("Auteur", { sourceCall: `${endpoint}?term=<auteur>&searchScope=author&limit=20`,
    refresh: "Bij minimaal twee tekens, na 250 ms. Altijd binnen de gekozen perspective.",
    currentValue: form.authorFacetValue ? `${form.author} [exacte facetwaarde: ${form.authorFacetValue}]` : form.author });
  update("Zoek", { frontendUrl: built.href, currentValue: built.error || built.request });

  if (nbc) {
    update("Combinatiefilters", { example: "facetFilter=nbc:publicationYear_key:2013&facetFilter=nbc:language_key:language~iso639-2~dut" });
    for (const [field, key] of Object.entries(NBC_FIELDS)) update(field, {
      valuePattern: `${key}:<term uit filterList>`, source: `titlesummary.facets[name=${key}].filterList`,
      purpose: "Vult deze lijst met de labels en exacte facetwaarden van de gekozen NBC+-bron.",
      sourceCall: `${endpoint}?returnType=default&term=<hoofdzoekterm of *>&searchScope=<scope>&limit=1`,
      refresh: "Dynamisch bij bron- of hoofdzoektermwijziging, na 400 ms.", example: "",
      note: "De volledige key:term-waarde wordt ongewijzigd als facetFilter doorgegeven. Geen vertaling van lokale WISE-codes. Alleen door OCLC geleverde facetwaarden worden aangeboden; dit is geen volledige woordenlijst. Een al geselecteerde waarde blijft zichtbaar als die ontbreekt in de nieuwe facetrespons. Bronfouten worden gemeld.",
    });
    if (["3684", "3685"].includes(form.perspectiveId)) update("Formaat", {
      status: "VIA VOORSELECTIE", oclcParameter: "perspectiveId", source: "OCLC perspective", sourceCall: "",
      purpose: "De cataloguskeuze bepaalt al het digitale formaat.", refresh: "Geen afzonderlijke formaat-vullijst nodig.",
      valuePattern: `perspectiveId=${form.perspectiveId}`, example: `perspectiveId=${form.perspectiveId}&term=*`,
      note: "E-books en luisterboeken kiezen hun formaat via de perspective. Er wordt geen aanvullend mediumTypeCode- of carrier-filter verzonnen.",
    });
    update("Auteur", { source: "OCLC nbc:creatorNameProfile1NtaOrTitle_key",
      valuePattern: "term=<auteur>&searchScope=author; in combinatie: facetFilter=nbc:creatorNameProfile1NtaOrTitle_key:<exacte term>",
      example: "facetFilter=nbc:creatorNameProfile1NtaOrTitle_key:Max Velthuijs",
      note: "Als hoofdzoekterm gebruikt Auteur searchScope=author. Naast een andere hoofdzoekterm is een gekozen exacte auteursfacetwaarde uit deze NBC+-bron vereist." });
    update("Titel", { valuePattern: "term=<titel>&searchScope=title",
      note: "Titel is hoofdzoekterm als Vrij zoeken leeg is en kan met de aangeboden facetfilters worden gecombineerd. Titel naast Vrij zoeken wordt geblokkeerd; er wordt geen onbewezen NBC+-termFilter gemaakt." });
    update("Reeks", { valuePattern: "term=<reeks>&searchScope=series", oclcParameter: "term + searchScope",
      note: "Reeks kan als hoofdzoekterm met facetfilters worden gecombineerd. Naast een andere hoofdzoekterm wordt Reeks geblokkeerd; er wordt geen onbewezen series-facet gebruikt." });
    update("Jaar", { valuePattern: "nbc:publicationYear_key:<jaar>", example: "facetFilter=nbc:publicationYear_key:2013",
      note: "Een los numeriek jaar via de native NBC+-facet. Geen datum of tijdcomponent." });
    for (const field of ["Aanwezig", "Bibliotheek", "Plaatsingscode (check)", "Jaar van–tot", "ISSN (check)", "Uitgever (check)", "ISBN (check)", "Collectie (check)", "Inhoud (check)"]) {
      update(field, { status: "NIET BESCHIKBAAR BIJ NBC+", oclcParameter: "", valuePattern: "", example: "",
        note: "Grijs weergegeven. Deze lokale veldmapping of bereiknotatie is voor NBC+ niet gevalideerd en wordt niet meegestuurd. Geen stille vertaling of negeren van ingevulde waarden." });
    }
  }
  const seen = new Set();
  for (const call of calls) {
    if (!call?.url || seen.has(call.url)) continue;
    seen.add(call.url);
    mapping.push({ field: "Uitgevoerde broncall", inputType: "requestlog", status: call.ok ? "OK" : "FOUT",
      oclcEndpoint: call.url, currentValue: `HTTP ${call.status ?? "onbekend"}`,
      note: "Werkelijk uitgevoerde call voor catalogi, auteurs of NBC+-vullijsten; de gedeelde zoek-API kan daarbij ook broncounters ophalen. Dit is niet de nog uit te voeren hoofdzoekopdracht." });
  }
  return mapping.map((row, index) => ({ ...row, order: index + 1 }));
}

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
    ["backend", "Backend gekozen bron"], ["currentValue", "Actuele waarde"], ["frontendUrl", "Frontend URL"],
  ];

  return "\uFEFF" + [
    columns.map(([, label]) => escapeCsv(label)).join(";"),
    ...mappingRows.map((row) => columns.map(([key]) => escapeCsv(row?.[key])).join(";")),
  ].join("\n");
}
