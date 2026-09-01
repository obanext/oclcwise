const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

function escapeCsv(value) {
  const stringValue = text(value);

  if (/[",\n\r;]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Flatten one OCLC response body into endpoint, field-path and value rows.
 * Arrays retain their numeric index so the source structure remains traceable.
 */
function flattenValue(value, endpoint, path = "", rows = []) {
  if (Array.isArray(value)) {
    if (!value.length) rows.push({ endpoint, veldpad: path, waarde: "[]" });

    value.forEach((entry, index) => {
      flattenValue(entry, endpoint, `${path}[${index}]`, rows);
    });

    return rows;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (!keys.length) rows.push({ endpoint, veldpad: path, waarde: "{}" });

    keys.forEach((key) => {
      const nextPath = path ? `${path}.${key}` : key;
      flattenValue(value[key], endpoint, nextPath, rows);
    });

    return rows;
  }

  rows.push({ endpoint, veldpad: path, waarde: text(value) });
  return rows;
}

/** Build one source-evidence row set from all OCLC detail responses. */
export function buildOclcDetailRows(data = {}) {
  const sections = [
    ["/discovery/title/{id}", data?.title],
    ["/title/{id}", data?.titleInfo],
    ["/branch/{branchId}/titleavailability/{id}", data?.availability],
    ["/title/{id}/iteminformation", data?.itemInformation],
    ["/title/{titleId}/recommended/title?limit=5&offset=0", data?.recommendations],
  ];

  return sections.flatMap(([endpoint, body]) => flattenValue(body, endpoint));
}

/** Convert OCLC detail source rows to a semicolon-separated CSV. */
export function toOclcDetailCsv(rows = []) {
  const headers = ["endpoint", "veldpad", "waarde"];

  return [
    headers.join(";"),
    ...asArray(rows).map((row) => headers.map((header) => escapeCsv(row?.[header])).join(";")),
  ].join("\n");
}
