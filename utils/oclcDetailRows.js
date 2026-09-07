import { getOclcDetailFieldMeta } from "./oclcDetailFieldMap.js";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const rawText = (value) => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  return String(value);
};

function escapeCsv(value) {
  const stringValue = rawText(value);

  if (/[",\n\r;]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Flatten one raw OCLC response into visual rows.
 * Numeric array indices remain visible so no source value is merged or deduplicated.
 */
function flattenValue(value, section, path = "", rows = []) {
  if (Array.isArray(value)) {
    if (!value.length) addRow(rows, section, path, "[]");

    value.forEach((entry, index) => {
      flattenValue(entry, section, `${path}[${index}]`, rows);
    });

    return rows;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (!keys.length) addRow(rows, section, path, "{}");

    keys.forEach((key) => {
      const nextPath = path ? `${path}.${key}` : key;
      flattenValue(value[key], section, nextPath, rows);
    });

    return rows;
  }

  addRow(rows, section, path, rawText(value));
  return rows;
}

function addRow(rows, section, indexedPath, waarde) {
  const veldnaamOclc = indexedPath || "(response)";
  const meta = getOclcDetailFieldMeta(section.key, veldnaamOclc);

  rows.push({
    endpointKey: section.key,
    veldnaamOclc,
    genormaliseerdVeldpad: meta.normalizedPath,
    veldnaamSite: meta.siteName,
    obaIst: meta.obaIst,
    endpoint: section.endpoint,
    waarde,
    opmerkingen: meta.opmerkingen,
  });
}

/** Build the complete raw source table from every ALL-detail response in scope. */
export function buildOclcDetailRows(data = {}) {
  const sections = [
    { key: "discovery", endpoint: "/discovery/title/{titleId}", body: data?.title },
    { key: "title", endpoint: "/title/{titleId}", body: data?.titleInfo },
    {
      key: "availability",
      endpoint: "/branch/{branchId}/titleavailability/{titleId}?clientType=PUBLIC&holdsCount=true",
      body: data?.availability,
    },
    {
      key: "items",
      endpoint: "/title/{titleId}/iteminformation?branchId=1000&branchCatGroups=0&clientType=I",
      body: data?.itemInformation,
    },
    {
      key: "recommendations",
      endpoint: "/title/{titleId}/recommended/title?limit=5&offset=0",
      body: data?.recommendations,
    },
  ];

  return sections.flatMap((section) => flattenValue(section.body, section));
}

/** Convert the same visual ALL table to a semicolon-separated CSV. */
export function toOclcDetailCsv(rows = []) {
  const columns = [
    ["veldnaamOclc", "Veldnaam OCLC"],
    ["veldnaamSite", "Veldnaam site"],
    ["obaIst", "OBA.nl IST"],
    ["endpoint", "Endpoint path"],
    ["waarde", "Waarde"],
    ["opmerkingen", "Opmerkingen"],
  ];

  return [
    columns.map(([, header]) => escapeCsv(header)).join(";"),
    ...asArray(rows).map((row) => columns.map(([key]) => escapeCsv(row?.[key])).join(";")),
  ].join("\n");
}
