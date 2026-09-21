// Run: node --experimental-vm-modules --test tests/oclc-search-filters.test.mjs
// The real API handler is exercised with a deterministic OCLC transport.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as filters from "../utils/oclcSearchFilters.js";
import { buildOclcNbcPlusUsedRows } from "../utils/oclcNbcPlusDetailRows.js";
import { buildOclcUsedFieldRows, buildOclcFilterRows, toOclcUsedFieldsCsv } from "../utils/oclcSearchMappingRows.js";
import { EMPTY_ADVANCED_FORM, advancedSourceChange, buildAdvancedSearch, advancedFacetOptions, getAuthorFacetOptions } from "../utils/oclcAdvancedSearch.js";
import { preselectValue } from "../utils/oclcPreselect.js";
import { buildAdvancedSearchMappingRows, toAdvancedSearchMappingCsv } from "../utils/advancedSearchMappingRows.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const perspectives = ["3682", "3683", "3684", "3685", "3686", "3687", "3688"].map((id) => ({
  id, backend: filters.isNbcPerspective(id) ? "nbcplus" : "wise", labelText: id,
  searchScopes: ["anything", "author", "title", "subject", "series"].map((labelText) => ({ labelText })),
  sortings: [{ id: "2910", sortDesc: true }, { id: "2912", sortDesc: true }],
}));
const clean = (value) => JSON.parse(JSON.stringify(value));

async function request(query, { body = { total: 13, items: [], facets: [] }, countBody = 20 } = {}) {
  const calls = [];
  const fetchWiseResponse = async (url) => {
    calls.push(new URL(url));
    const isPerspective = url.endsWith("/perspective");
    const isCount = new URL(url).searchParams.get("returnType") === "count";
    return { url: new URL(url).pathname + new URL(url).search, status: 200, ok: true,
      body: isPerspective ? { perspective: perspectives } : isCount ? countBody : body };
  };
  const context = vm.createContext({ URL, URLSearchParams, console });
  const modules = new Map();
  function getModule(filename) {
    if (modules.has(filename)) return modules.get(filename);
    let module;
    if (filename.endsWith("/wiseResponse.js")) {
      module = new vm.SyntheticModule(["fetchWiseResponse"], function () { this.setExport("fetchWiseResponse", fetchWiseResponse); }, { context });
    } else if (filename.endsWith("/wiseSuggestions.js")) {
      module = new vm.SyntheticModule(["fetchWiseSuggestions"], function () { this.setExport("fetchWiseSuggestions", async () => ({ ok: true, suggestions: [] })); }, { context });
    } else {
      module = new vm.SourceTextModule(fs.readFileSync(filename, "utf8"), { context, identifier: filename });
    }
    modules.set(filename, module);
    return module;
  }
  const module = getModule(path.join(root, "pages/api/oclc-search.js"));
  await module.link((specifier, parent) => getModule(path.resolve(path.dirname(parent.identifier), specifier)));
  await module.evaluate();
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = clean(value); }, setHeader() {} };
  await module.namespace.default({ method: "GET", query }, response);
  return { ...response, calls, main: calls.find((url) => url.searchParams.get("returnType") === "default") };
}

test("all NBC+ detail routes produce native collection/facet links", () => {
  const record = { media: { icon: "CD", description: "Album" }, publicationYear: "2023",
    language: [{ description: "Nederlands", code: "DUT" }], author: { description: "Velthuijs, Max" },
    subjects: [{ description: "Vriendschap" }], genre: [{ description: "Schoolverhaal", code: "Ebsc" }] };
  for (const [detailType, perspectiveId] of [["ebook", "3684"], ["luisterboek", "3685"], ["landelijk", "3687"]]) {
    const rows = buildOclcNbcPlusUsedRows(record, { detailType });
    const links = rows.flatMap((row) => [row.href, ...(row.hrefs || [])]).filter(Boolean);
    assert.ok(links.length >= 5);
    for (const href of links) {
      const params = new URL(href, "http://localhost").searchParams;
      assert.equal(params.get("perspectiveId"), perspectiveId);
      assert.ok(params.get("term"));
      assert.equal(params.has("q") || params.has("all"), false);
      for (const value of params.getAll("facetFilter")) {
        assert.equal(params.get("term"), "*");
        assert.ok(value.startsWith("nbc:"));
      }
    }
    const format = new URL(rows.find((row) => row.label === "Formaat").href, "http://localhost");
    assert.equal(format.searchParams.get("term"), "*");
    assert.equal(format.searchParams.has("facetFilter"), detailType === "landelijk");
  }
});

test("NBC+ filters stay separate, including criteria in the same facet", async () => {
  const selected = ["nbc:publicationYear_key:2013", "nbc:publicationYear_key:2023", "nbc:language_key:language~iso639-2~dut"];
  for (const perspectiveId of ["3684", "3685", "3687"]) {
    const result = await request({ perspectiveId, facetFilter: selected }, { body: { total: 0, items: [] } });
    assert.equal(result.statusCode, 200);
    assert.equal(result.main.searchParams.get("term"), "*");
    assert.deepEqual(result.main.searchParams.getAll("facetFilter"), selected);
    assert.equal(result.body.pagination.total, 0);
    assert.equal(result.calls.some((url) => url.searchParams.get("filterAvailableTitles") === "true"), false);
  }
});

test("source counts match clicking that source; active source uses main total", async () => {
  const result = await request({ perspectiveId: "3684", term: "kikker", searchScope: "author", facetFilter: "nbc:publicationYear_key:2013" });
  assert.equal(result.body.perspectives.find((p) => p.id === "3684").count, 13);
  assert.equal(result.calls.filter((url) => url.pathname.includes("/perspective/3684/titlesummary")).length, 1);
  for (const call of result.calls.filter((url) => url.searchParams.get("returnType") === "count")) {
    const id = call.pathname.match(/perspective\/(\d+)/)[1];
    const target = filters.searchStateForPerspective({ q: "kikker", nextFacetFilters: ["nbc:publicationYear_key:2013"] }, id);
    const link = new URL(filters.buildSearchUrl(target), "http://localhost");
    assert.equal(call.searchParams.get("term"), link.searchParams.get("term"));
    assert.equal(call.searchParams.get("searchScope"), link.searchParams.get("searchScope"));
    assert.equal(call.searchParams.has("facetFilter") || call.searchParams.has("termFilter"), false);
  }
});

test("WISE retains OR grouping and individual removal preserves other criteria", async () => {
  const selections = filters.expandFacetSelections(["languageCode:DUT|ENG", "mediumTypeCode:BOE"]);
  assert.deepEqual(selections, ["languageCode:DUT", "languageCode:ENG", "mediumTypeCode:BOE"]);
  const result = await request({ perspectiveId: "3682", term: "kikker", facetFilter: selections, termFilter: "title:Kikker" });
  assert.deepEqual(result.main.searchParams.getAll("facetFilter"), ["languageCode:DUT|ENG", "mediumTypeCode:BOE"]);
  const url = new URL(filters.buildSearchUrl({ q: "kikker", nextPerspectiveId: "3682", nextPage: 1, nextSort: "2912",
    nextFacetFilters: selections.filter((x) => x !== "languageCode:DUT"), nextTermFilters: ["title:Kikker"] }), "http://localhost");
  assert.deepEqual(url.searchParams.getAll("facetFilter"), ["languageCode:ENG", "mediumTypeCode:BOE"]);
  assert.equal(url.searchParams.get("termFilter"), "title:Kikker");
  assert.equal(url.searchParams.get("sort"), "2912");
  assert.equal(url.searchParams.get("term"), "kikker");
});

test("empty/invalid upstream responses are errors, genuine zero is valid", async () => {
  for (const body of [null, "", {}, { total: 0 }, { total: null, items: [] }]) {
    const result = await request({ term: "kikker", perspectiveId: "3684" }, { body });
    assert.equal(result.statusCode, 502);
    assert.equal(result.body.pagination, undefined);
    assert.equal(result.body.debug.calls[1].upstreamStatus, 200);
  }
  const result = await request({ term: "kikker", perspectiveId: "3684" }, { countBody: null });
  assert.equal(result.body.perspectives.find((p) => p.id === "3685").count, null);
  assert.ok(result.body.perspectives.find((p) => p.id === "3685").countError);
  assert.equal(result.body.perspectives.find((p) => p.id === "3684").count, 13);
});

test("incompatible filters cannot silently produce unfiltered results", async () => {
  for (const query of [
    { perspectiveId: "3684", facetFilter: "mediumTypeCode:ORB" },
    { perspectiveId: "3682", facetFilter: "nbc:publicationYear_key:2013" },
    { perspectiveId: "3684", facetFilter: "nbc:publicationYear_key:2013|2023" },
  ]) {
    const result = await request(query);
    assert.equal(result.statusCode, 400);
    assert.equal(result.main, undefined);
  }
});

test("CSV includes real NBC field names, requests, instructions and zero counts", async () => {
  const result = await request({ perspectiveId: "3684", term: "kikker" }, { countBody: 0,
    body: { total: 13, items: [], facets: [{ name: "nbc:publicationYear_key", filterList: [{ key: "nbc:publicationYear_key", term: "2013", label: "2013", count: 13 }] }] } });
  assert.equal(result.body.perspectives.find((p) => p.id === "3685").count, 0);
  const rows = buildOclcFilterRows(result.body);
  assert.ok(rows.some((row) => row.oclcField === "nbc:publicationYear_key"));
  const csv = toOclcUsedFieldsCsv(buildOclcUsedFieldRows(result.body));
  for (const phrase of ["term=*", "NBC+", "sessionStorage", "Werkelijk uitgevoerde call", "Bron wisselen en tellers", "Fouten onderscheiden"]) assert.ok(csv.includes(phrase), phrase);
  assert.ok(csv.startsWith("\uFEFF"));
});

function queryFromHref(href) {
  const params = new URL(href, "http://localhost").searchParams;
  return { ...Object.fromEntries(params), facetFilter: params.getAll("facetFilter"), termFilter: params.getAll("termFilter") };
}

test("preselection and advanced criteria reach one WISE request with one branch filter", async () => {
  let form = { ...EMPTY_ADVANCED_FORM, term: "kikker", mediumTypeCode: "BOE", languageCode: "DUT", yearFrom: "2022", yearTo: "2023", available: true };
  form = advancedSourceChange(form, "branch:1001", perspectives).form;
  assert.equal(preselectValue(form), "branch:1001");
  const built = buildAdvancedSearch(form);
  assert.equal(built.error, "");
  const response = await request(queryFromHref(built.href));
  assert.equal(response.statusCode, 200);
  assert.match(response.main.pathname, /branch\/1000\/perspective\/3682\/titlesummary$/);
  assert.equal(response.main.searchParams.get("term"), "kikker");
  assert.equal(response.main.searchParams.get("filterAvailableTitles"), "true");
  assert.deepEqual(response.main.searchParams.getAll("facetFilter"), ["mediumTypeCode:BOE", "branchId:1001", "languageCode:DUT", "customPublicationYear:2022-2023"]);
  assert.equal(response.main.href, new URL(built.request).href);
  assert.equal(/[?&](q|all|presel|preselect)=/.test(built.href), false);

  // Changing either selector uses the same state; replacing/clearing cannot stack branches.
  form = advancedSourceChange(form, "branch:1002", perspectives).form;
  assert.deepEqual(queryFromHref(buildAdvancedSearch(form).href).facetFilter.filter((value) => value.startsWith("branchId:")), ["branchId:1002"]);
  form = advancedSourceChange(form, "catalog:3683", perspectives).form;
  assert.equal(preselectValue(form), "catalog:3683");
  assert.equal(form.branchId, "");
  assert.equal(form.mediumTypeCode, "BOE");
  assert.equal(queryFromHref(buildAdvancedSearch(form).href).perspectiveId, "3683");
});

test("all NBC+ preselected sources use native criteria and the preview matches the real API builder", async () => {
  for (const perspectiveId of ["3684", "3685", "3687", "3688"]) {
    const form = { ...EMPTY_ADVANCED_FORM, perspectiveId, year: "2013",
      languageCode: "nbc:language_key:language~iso639-2~dut",
      genreCode: "nbc:subjectNbdgenre_key:subject~nbdgenre~Ebsc",
      targetAudienceCode: "nbc:audienceNbcLeeftijdscategorie_key:audience~nbcleeftijdscategorie~1.0",
      mediumTypeCode: ["3687", "3688"].includes(perspectiveId) ? "nbc:carrierOB_key:carrier~ob~A" : "" };
    const built = buildAdvancedSearch(form);
    assert.equal(built.error, "");
    const query = queryFromHref(built.href);
    assert.equal(query.term, "*");
    assert.equal(query.perspectiveId, perspectiveId);
    assert.equal(query.facetFilter.length, ["3687", "3688"].includes(perspectiveId) ? 5 : 4);
    assert.ok(query.facetFilter.every((filter) => filter.startsWith("nbc:")));
    const response = await request(query);
    assert.equal(response.statusCode, 200);
    assert.equal(response.main.href, new URL(built.request).href);
  }
});

test("changing backend clears incompatible values and cannot restore stale WISE filters", () => {
  const local = { ...EMPTY_ADVANCED_FORM, term: "kikker", title: "Kikker", author: "Velthuijs", authorFacetValue: "Velthuijs, Max",
    mediumTypeCode: "ORB", branchId: "1001", languageCode: "DUT", yearFrom: "2022", yearTo: "2023", available: true };
  const changed = advancedSourceChange(local, "catalog:3684", perspectives);
  assert.equal(changed.resetCriteria, true);
  assert.deepEqual(changed.form, { ...EMPTY_ADVANCED_FORM, term: "kikker", perspectiveId: "3684" });
  const audio = advancedSourceChange({ ...changed.form, year: "2013", languageCode: "nbc:language_key:language~iso639-2~dut" }, "catalog:3685", perspectives);
  assert.deepEqual(audio.form, { ...EMPTY_ADVANCED_FORM, term: "kikker", perspectiveId: "3685" });
  const back = advancedSourceChange(audio.form, "branch:1002", perspectives);
  assert.deepEqual(back.form, { ...EMPTY_ADVANCED_FORM, term: "kikker", branchId: "1002" });
});

test("invalid combinations are blocked instead of dropping user input", () => {
  for (const extra of [
    { mediumTypeCode: "ORB" }, { yearFrom: "2022", yearTo: "2023" }, { available: true },
    { branchId: "1001" }, { isbn: "9789025865627" }, { term: "kikker", title: "Kikker" },
    { term: "kikker", series: "Kikker" }, { languageCode: "languageCode:DUT" },
    { languageCode: "nbc:language_key:language~iso639-2~dut|language~iso639-2~eng" },
    { term: "kikker", author: "Velthuijs" },
  ]) {
    const built = buildAdvancedSearch({ ...EMPTY_ADVANCED_FORM, perspectiveId: "3684", ...extra });
    assert.ok(built.error, JSON.stringify(extra));
    assert.equal(built.href, "");
    assert.equal(built.request, "");
  }
  for (const perspectiveId of ["3682", "3684", "3685", "3687"]) {
    const alone = buildAdvancedSearch({ ...EMPTY_ADVANCED_FORM, perspectiveId, subject: "dieren" });
    assert.equal(queryFromHref(alone.href).searchScope, "subject");
    assert.ok(buildAdvancedSearch({ ...EMPTY_ADVANCED_FORM, perspectiveId, subject: "dieren", year: "2023" }).error);
  }
});

test("author suggestions and native lists preserve OCLC keys and terms including colons", async () => {
  const data = { facets: [
    { name: "nbc:creatorNameProfile1NtaOrTitle_key", values: [{ key: "nbc:creatorNameProfile1NtaOrTitle_key", term: "Max Velthuijs", label: "Max Velthuijs" }] },
    { name: "nbc:subjectNbdgenre_key", filterList: [{ key: "nbc:subjectNbdgenre_key", term: "subject~nbdgenre~Ebsc", label: "Schoolverhaal" }] },
  ] };
  assert.deepEqual(getAuthorFacetOptions(data, true), [{ value: "Max Velthuijs", label: "Max Velthuijs" }]);
  assert.deepEqual(getAuthorFacetOptions(data, false), []);
  assert.deepEqual(advancedFacetOptions(data, "nbc:subjectNbdgenre_key"), [{ code: "nbc:subjectNbdgenre_key:subject~nbdgenre~Ebsc", label: "Schoolverhaal" }]);
  const form = { ...EMPTY_ADVANCED_FORM, perspectiveId: "3684", term: "kikker", author: "Max Velthuijs", authorFacetValue: "Max Velthuijs" };
  const result = await request(queryFromHref(buildAdvancedSearch(form).href));
  assert.deepEqual(result.main.searchParams.getAll("facetFilter"), ["nbc:creatorNameProfile1NtaOrTitle_key:Max Velthuijs"]);
  for (const [field, scope] of [["title", "title"], ["author", "author"], ["series", "series"]]) {
    const single = buildAdvancedSearch({ ...EMPTY_ADVANCED_FORM, perspectiveId: "3684", [field]: "Kikker" });
    assert.equal(queryFromHref(single.href).searchScope, scope);
    assert.equal((await request(queryFromHref(single.href))).statusCode, 200);
  }
});

test("advanced CSV documents active preselection, backend limitations, source files and actual calls", () => {
  for (const perspectiveId of ["3682", "3684", "3687"]) {
    const form = { ...EMPTY_ADVANCED_FORM, perspectiveId, term: "kikker" };
    const rows = buildAdvancedSearchMappingRows({ form, calls: [{ url: "/restapi/test-perspective", ok: true, status: 200 }] });
    assert.equal(rows[0].field, "Voorselectie (old-school)");
    assert.equal(rows[1].field, "Vrij zoeken");
    const preview = rows.find((row) => row.field === "OCLC request");
    assert.ok(preview.currentValue.includes(`/perspective/${perspectiveId}/titlesummary`));
    assert.ok(preview.frontendUrl.includes(`perspectiveId=${perspectiveId}`));
    assert.equal(rows.at(-1).field, "Uitgevoerde broncall");
    const csv = toAdvancedSearchMappingCsv(rows);
    assert.ok(csv.startsWith("\uFEFF"));
    for (const note of ["branch.txt", "NTB", "applicatiekeuze"]) assert.ok(csv.includes(note));
    if (perspectiveId === "3682") {
      for (const file of ["mediumtypecode.txt", "languagecode.txt", "genrecode.txt", "targetaudiencecode.txt"]) assert.ok(csv.includes(file));
    } else {
      assert.equal(rows.find((row) => row.field === "Jaar van–tot").status, "NIET BESCHIKBAAR BIJ NBC+");
      assert.ok(rows.find((row) => row.field === "Taal").valuePattern.includes("nbc:language_key"));
      assert.equal(rows.find((row) => row.field === "Bibliotheek").example, "");
    }
  }
});
