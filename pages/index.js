import Link from "next/link";

const detailOptions = [
  {
    label: "IST oba.nl detailpagina",
    description:
      "OCLC Wise data wordt geladen in een mock-up oba.nl detailpagina gebaseerd op GB 'bonbon met knoflooksmaak' model.",
    href: "/oba-detail/842851",
    status: "Beschikbaar",
  },
  {
    label: "ALL oba.nl detailpagina",
    description:
      "OCLC Wise brondata wordt rechtstreeks geladen in een detailweergave.",
    href: "/oclc-detail/842851",
    status: "Beschikbaar",
  },
  {
    label: "SOLL oba.nl detailpagina",
    description:
      "OCLC Wise data wordt geladen in een mock-up oba.nl SOLL.",
    status: "Nog te implementeren",
  },
];

const searchOptions = [
  {
    label: "IST oba.nl zoekpagina",
    description:
      "OCLC Wise data wordt geladen in een mock-up oba.nl zoekpagina met de filters en facetten gebaseerd op GB 'bonbon met knoflooksmaak' model.",
    href: "/oba-search",
    status: "Beschikbaar",
  },
  {
    label: "ALL oba.nl zoekpagina",
    description:
      "OCLC Wise data wordt geladen in een mock-up oba.nl zoekpagina met alle mogelijke filters en facetten uit OCLC Wise endpoints.",
    href: "/oclc-search",
    status: "Beschikbaar",
  },
  {
    label: "SOLL oba.nl zoekpagina",
    description:
      "OCLC Wise data wordt geladen in een mock-up oba.nl SOLL.",
    status: "Nog te implementeren",
  },
  {
    label: "Zoeken met natuurlijke taal",
    description:
      "Nexi handelt de natuurlijke-taal zoekopdracht af; de OBA mock-up toont zoekveld en resultaten.",
    href: "/nexi-search",
    status: "Beschikbaar",
  },
];

const oldSchoolOptions = [
  {
    label: "OLD SCHOOL voorselectie zoekbalk",
    description:
      "Voorselectie op basis van OCLC Wise perspectives en branchId-facetten, zoals Aquabrowser voorselectie.",
    href: "/old-school-search",
    status: "Beschikbaar",
  },
  {
    label: "OLD SCHOOL uitgebreid zoeken",
    description:
      "Uitgebreid zoeken op basis van OCLC Wise search, searchScopes en facetFilters. Werkt ook zonder vrije zoekterm.",
    href: "/uitgebreid-zoeken",
    status: "Beschikbaar",
  },
];

function OptionCard({ option }) {
  const content = (
    <>
      <div className="preselect-card-top">
        <h3>{option.label}</h3>
        <span className={option.href ? "preselect-status active" : "preselect-status"}>
          {option.status}
        </span>
      </div>
      <p>{option.description}</p>
    </>
  );

  if (!option.href) {
    return <article className="preselect-card disabled">{content}</article>;
  }

  return (
    <Link href={option.href} className="preselect-card linked">
      {content}
    </Link>
  );
}

function OptionSection({ title, options }) {
  return (
    <section className="preselect-section">
      <h2>{title}</h2>
      <div className="preselect-grid">
        {options.map((option) => (
          <OptionCard key={option.label} option={option} />
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main>
      <div className="header-image">
        <img src="/header.JPG" alt="OBA" />
      </div>

      <div className="container preselect-page">
        <section className="preselect-intro">
          <h1>Zandbak OCLC Wise zoek en detail endpoints voor oba.nl</h1>
          <p>
            In deze omgeving wordt OCLC Wise testdata geladen in een mock-up oba.nl design,
            zowel voor de huidige IST-situatie, de toekomstige eis/wens SOLL voor oba.nl en de ALLe output uit de OCLC Wise endpoints
          </p>
          <p className="preselect-contact">
            Vragen: <a href="mailto:m.vos@oba.nl">m.vos@oba.nl</a>
          </p>
        </section>

        <OptionSection title="detailpagina" options={detailOptions} />
        <OptionSection title="zoekpagina" options={searchOptions} />
        <OptionSection title="old school Aquabrowser-functies" options={oldSchoolOptions} />
      </div>
    </main>
  );
}
