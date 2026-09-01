// Convert detail mapping rows to the CSV downloaded from the detail page.
export function toDetailMappingCsv(rows) {
  const headers = [
    "OBA detailpagina",
    "raw XML ABL pad",
    "raw JSON GB pad",
    "OCLC endpoint",
    "OCLC veldpad",
    "mapped JSON pad",
    "transformatie",
    "status",
    "opmerking",
    "OCLC waarde",
  ];

  // Escape one CSV cell.
  const escape = (value) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  return [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.label,
        row.rawXmlPath,
        row.rawJsonPath,
        row.oclcEndpoint,
        row.oclcField,
        row.mappedPath,
        row.transformation,
        row.status,
        row.note,
        row.oclcValue,
      ].map(escape).join(",")
    ),
  ].join("\n");
}
