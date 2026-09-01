import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { buildDetailMappingRows } from "../../utils/mappingRows";
import { toDetailMappingCsv } from "../../utils/csv";

// Pretty-print JSON for the visible debug panels.
const pretty = (value) => JSON.stringify(value, null, 2);

// Normalize OCLC/mapped values that can be returned as singleton or array.
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// Convert optional API values to safe display strings.
const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

// Read a keyed branch field from the mapped librarian-info branch contract.
const getBranchField = (branch, key) =>
  asArray(branch?.branches).find((item) => item?._attributes?.key === key)?._text || "";

// Translate OCLC item statuses to the simple Dutch labels used in the visual availability table.
const mapStatus = (status) => {
  switch (text(status)) {
    case "AVAILABLE": return "Aanwezig";
    case "ON_LOAN": return "Uitgeleend";
    case "MISSING": return "Niet beschikbaar";
    case "IN_TRANSIT":
    case "IN_TRANSIT_LINKED":
    case "SIP_CHECK_IN": return "Onderweg";
    default: return text(status);
  }
};

// Read one MARC/df subfield from the mapped contract. Used by the specifications table.
const getMarcSingle = (mapped, tag, key) => {
  const value = mapped?.["librarian-info"]?.record?.marc?.[tag]?.[tag];
  if (Array.isArray(value)) {
    return text(value.find((item) => item?._attributes?.key === key)?._text);
  }
  return value?._attributes?.key === key ? text(value?._text) : "";
};

// Read repeating MARC/df subfields from the mapped contract.
const getMarcRepeating = (mapped, tag, key) =>
  asArray(mapped?.["librarian-info"]?.record?.marc?.[tag])
    .map((entry) => {
      const value = entry?.[tag];
      if (Array.isArray(value)) {
        return text(value.find((item) => item?._attributes?.key === key)?._text);
      }
      return value?._attributes?.key === key ? text(value?._text) : "";
    })
    .filter(Boolean);

// Flatten raw OCLC objects for the visible "alles oclc" evidence table.
function flattenOclc(value, prefix = "") {
  const rows = [];

  if (value === null || value === undefined) {
    rows.push({ field: prefix, value: "" });
    return rows;
  }

  if (typeof value !== "object") {
    rows.push({ field: prefix, value });
    return rows;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      rows.push({ field: prefix, value: "" });
      return rows;
    }

    value.forEach((item, index) => {
      rows.push(...flattenOclc(item, `${prefix}[${index}]`));
    });

    return rows;
  }

  const keys = Object.keys(value);

  if (!keys.length) {
    rows.push({ field: prefix, value: "" });
    return rows;
  }

  keys.forEach((key) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    rows.push(...flattenOclc(value[key], nextPrefix));
  });

  return rows;
}

// IST detail page.
// Purpose: visual detail A/B page plus OCLC source evidence, API calls, mapped output and CSV download.
export default function Page() {
  const router = useRouter();
  const { id } = router.query;

  const [data, setData] = useState(null);
  const [tab, setTab] = useState("availability");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || !id) return;

    let cancelled = false;
    setError("");
    setData(null);

    fetch(`/api/oba-detail?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const json = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(json?.error || `Request failed with status ${response.status}`);
        }

        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Onbekende fout");
      });

    return () => {
      cancelled = true;
    };
  }, [router.isReady, id]);

  const mapped = data?.mapped || {};
  const raw = data?.raw || {};
  const calls = asArray(raw?.debug?.calls);
  const warnings = asArray(data?.warnings);

  const title = text(mapped?.titles?.title?._text);
  const shortTitle = text(mapped?.titles?.["short-title"]?._text);
  const subtitle = text(mapped?.titles?.subtitle?._text);
  const author = text(mapped?.authors?.["main-author"]?._text);
  const summary = text(mapped?.summaries?.summary?._text);

  const coverImage = useMemo(() => {
    const cover = mapped?.coverimages?.coverimage;
    if (Array.isArray(cover)) return text(cover[0]?._text);
    return text(cover?._text);
  }, [mapped]);

  const topSpecs = useMemo(() => {
    return [
      text(mapped?.formats?.format?._text),
      text(mapped?.languages?.language?._text),
      text(mapped?.publication?.publishers?.publisher?._text),
      text(mapped?.description?.["physical-description"]?._text),
      text(mapped?.series?.["series-title"]?._text),
      text(mapped?.["target-audiences"]?.["target-audience"]?._text),
    ].filter(Boolean);
  }, [mapped]);

  const subjects = useMemo(() => {
    return asArray(mapped?.subjects?.["topical-subject"])
      .map((item) => text(item?._text))
      .filter(Boolean);
  }, [mapped]);

  const specRows = useMemo(() => {
    const rows = [
      ["ISBN Nummer", asArray(mapped?.identifiers?.["isbn-id"]).map((item) => text(item?._text)).filter(Boolean).join(", ")],
      ["PPN Nummer", text(mapped?.identifiers?.["ppn-id"]?._text)],
      ["Boekcode", getMarcSingle(mapped, "df059", "j")],
      ["Taal publicatie", getMarcSingle(mapped, "df101", "a")],
      ["Hoofdtitel", getMarcSingle(mapped, "df200", "a") || title],
      ["Algemene materiaalaanduiding", getMarcSingle(mapped, "df200", "b")],
      ["Eerste verantwoordelijke", getMarcSingle(mapped, "df200", "f") || author],
      ["Titel - Volgende verantwoordelijken", getMarcSingle(mapped, "df200", "g")],
      ["Plaats van uitgave", getMarcSingle(mapped, "df210", "a")],
      ["Uitgever", getMarcSingle(mapped, "df210", "c") || text(mapped?.publication?.publishers?.publisher?._text)],
      ["Jaar van uitgave", getMarcSingle(mapped, "df210", "d") || text(mapped?.publication?.year?._text)],
      ["Pagina's", getMarcSingle(mapped, "df215", "a") || text(mapped?.description?.pages?._text)],
      ["Collatie - Illustraties", getMarcSingle(mapped, "df215", "c")],
      ["Centimeters", getMarcSingle(mapped, "df215", "d")],
      ["Collatie - Bijlage's", getMarcSingle(mapped, "df215", "e")],
      ["Serietitel", getMarcSingle(mapped, "df520", "a") || text(mapped?.series?.["series-title"]?._text)],
      ["Volume", getMarcSingle(mapped, "df520", "v")],
      ["Auteur Functie", getMarcSingle(mapped, "df700", "4")],
      ["Auteur Achternaam", getMarcSingle(mapped, "df700", "a")],
      ["Auteur Voornaam", getMarcSingle(mapped, "df700", "b")],
      ["Trefwoord - Hoofd geleding", getMarcRepeating(mapped, "df630", "a").join(", ")],
      ["Genre - Code", getMarcSingle(mapped, "df691", "a")],
      ["Auteur - secundaire - Functie", getMarcRepeating(mapped, "df702", "4").join(", ")],
      ["Auteur - secundaire - Achternaam", getMarcRepeating(mapped, "df702", "a").join(", ")],
      ["Auteur - secundaire - Voornaam", getMarcRepeating(mapped, "df702", "b").join(", ")],
      ["Bestelnummer NBD Nummer", getMarcSingle(mapped, "df014", "a")],
      ["Samenvatting - Tekst", getMarcSingle(mapped, "df320", "a") || summary],
      ["Prod country", getMarcSingle(mapped, "df044", "a")],
      ["Editie", getMarcSingle(mapped, "df205", "a")],
    ];

    return rows.filter(([, value]) => value);
  }, [mapped, title, author, summary]);

  const availabilityRows = useMemo(() => {
    return asArray(raw?.itemInformation)
      .map((item, index) => ({
        key: `${text(item?.barcode || item?.id) || "row"}-${index}`,
        location: text(item?.branchName),
        place: text(item?.subLocation || item?.shelfDescription || item?.location),
        shelf: text(item?.callNumber || item?.headWord),
        status: mapStatus(item?.effectiveStatus),
      }));
  }, [raw]);

  const oclcRows = useMemo(() => {
    return [
      { type: "section", field: "title — bibliografisch", value: "" },
      ...flattenOclc(raw?.title, "title"),

      { type: "section", field: "availability — beschikbaarheid", value: "" },
      ...flattenOclc(raw?.availability, "availability"),

      { type: "section", field: "titleInfo — titelbasis/momkeys", value: "" },
      ...flattenOclc(raw?.titleInfo, "titleInfo"),

      { type: "section", field: "itemInformation — holdings/exemplaren", value: "" },
      ...flattenOclc(raw?.itemInformation, "itemInformation"),
    ];
  }, [raw]);

  const csvRows = useMemo(() => buildDetailMappingRows(raw, mapped), [raw, mapped]);

  // Download the detail mapping documentation as CSV.
  const downloadCsv = () => {
    try {
      const csv = toDetailMappingCsv(csvRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.setAttribute("download", `detailpagina-mapping-${id}.csv`);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error("CSV download mislukt", downloadError);
      window.alert("CSV download mislukt. Controleer de console.");
    }
  };

  if (error) {
    return <div className="container">Fout: {error}</div>;
  }

  if (!data) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="page">
      <div className="header-image">
        <img src="/header.JPG" alt="Header" />
      </div>

      <div className="container detail-page">
        {warnings.length ? (
          <div className="detail-warning" role="status">
            <strong>Niet alle WISE-informatie kon worden geladen.</strong>
            <ul>
              {warnings.map((warning, index) => (
                <li key={`${warning.source}-${index}`}>
                  {warning.source} ({warning.status || "onbekende status"})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="hero">
          <div className="hero-left">
            <h1 className="title">{title || shortTitle || "Onbekende titel"}</h1>

            {subtitle && subtitle !== title && subtitle !== shortTitle ? (
              <div className="subtitle">{subtitle}</div>
            ) : null}

            {author ? <div className="author-line">{author}</div> : null}

            {summary ? <div className="summary-text">{summary}</div> : null}

            <div className="card-grid top-cards">
              <section className="info-card">
                <h2>Specificaties</h2>

                {topSpecs.length ? (
                  <ul className="plain-list">
                    {topSpecs.map((value, index) => (
                      <li key={`${value}-${index}`}>{value}</li>
                    ))}
                  </ul>
                ) : (
                  <ul className="plain-list">
                    <li>Geen specificaties beschikbaar</li>
                  </ul>
                )}
              </section>

              <section className="info-card">
                <h2>Onderwerpen</h2>

                {subjects.length ? (
                  <ul className="plain-list">
                    {subjects.map((value, index) => (
                      <li key={`${value}-${index}`}>{value}</li>
                    ))}
                  </ul>
                ) : (
                  <ul className="plain-list">
                    <li>Geen onderwerpen beschikbaar</li>
                  </ul>
                )}
              </section>
            </div>
          </div>

          <div className="hero-right">
            {coverImage ? (
              <img src={coverImage} className="cover-large" alt={title || shortTitle || "Cover"} />
            ) : (
              <div className="cover-placeholder">Geen cover</div>
            )}
          </div>
        </section>

        <div className="section-header">
          <h2>Praktische informatie</h2>

          <div className="tab-buttons">
            <button
              type="button"
              className={tab === "specs" ? "tab-button active" : "tab-button"}
              onClick={() => setTab("specs")}
            >
              specificaties
            </button>

            <button
              type="button"
              className={tab === "availability" ? "tab-button active" : "tab-button"}
              onClick={() => setTab("availability")}
            >
              beschikbaarheid
            </button>

            <button
              type="button"
              className={tab === "oclc" ? "tab-button active" : "tab-button"}
              onClick={() => setTab("oclc")}
            >
              alles oclc
            </button>
          </div>
        </div>

        {tab === "availability" ? (
          <section className="table-card">
            <div className="table-wrap">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Locatie</th>
                    <th>Plaats</th>
                    <th>Signatuur</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {availabilityRows.length ? (
                    availabilityRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.location || "—"}</td>
                        <td>{row.place || "—"}</td>
                        <td>{row.shelf || "—"}</td>
                        <td>{row.status || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      <td>Geen exemplaren beschikbaar</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "specs" ? (
          <section className="specs-list">
            {specRows.length ? (
              specRows.map(([label, value]) => (
                <div className="spec-row" key={label}>
                  <div className="spec-label">{label}</div>
                  <div className="spec-value">{value}</div>
                </div>
              ))
            ) : (
              <div className="spec-row">
                <div className="spec-label">Specificaties</div>
                <div className="spec-value">Geen specificaties beschikbaar</div>
              </div>
            )}
          </section>
        ) : (
          <section className="specs-list">
            {oclcRows.map((row, index) =>
              row.type === "section" ? (
                <div className="spec-row" key={`${row.field}-${index}`}>
                  <div className="spec-label" style={{ fontWeight: 700 }}>
                    {row.field}
                  </div>
                  <div className="spec-value"></div>
                </div>
              ) : (
                <div className="spec-row" key={`${row.field}-${index}`}>
                  <div className="spec-label">{row.field}</div>
                  <div className="spec-value">{text(row.value)}</div>
                </div>
              )
            )}
          </section>
        )}

        <section className="debug-section">
          <button type="button" className="tab-button" onClick={downloadCsv}>
            Download mapping CSV
          </button>

          <details className="debug-block">
            <summary>OCLC API calls</summary>

            <div className="debug-content">
              {calls.length ? (
                calls.map((call, index) => (
                  <details className="debug-call" key={`${call?.url || "call"}-${index}`}>
                    <summary>
                      {call?.url || "Onbekende call"} | {call?.status || "?"}
                    </summary>

                    <pre>{pretty(call?.body ?? call)}</pre>
                  </details>
                ))
              ) : (
                <pre>Geen calls beschikbaar</pre>
              )}
            </div>
          </details>

          <details className="debug-block">
            <summary>Mapped output</summary>

            <div className="debug-content">
              <pre>{pretty(mapped)}</pre>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
