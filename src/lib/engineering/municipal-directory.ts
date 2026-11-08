export const MUNICIPAL_SOURCES = [
  {
    municipality: "HOLLISTON",
    department: "https://www.townofholliston.us/187/Building",
    portal:
      "https://www.mapsonline.net/hollistonma/public_permit_reports.html.php",
    automation: "Manual research required",
    documents:
      "Portal access/document availability must be checked manually; no reliable documented public API confirmed.",
  },
  {
    municipality: "WORCESTER",
    department: "https://www.worcesterma.gov/building-zoning",
    portal: "https://opendata.worcesterma.gov/",
    automation: "Official ArcGIS Building Permits adapter",
    documents:
      "Metadata available; original drawings not exposed by this feed.",
  },
  {
    municipality: "BOSTON",
    department: "https://www.boston.gov/departments/inspectional-services",
    portal: "https://data.boston.gov/dataset/approved-building-permits",
    automation: "Official CKAN electrical-permit adapter",
    documents: "Metadata available; drawing URLs not exposed by this feed.",
  },
  {
    municipality: "CAMBRIDGE",
    department:
      "https://www.cambridgema.gov/inspection/buildingelectricplumbingpermits",
    portal:
      "https://data.cambridgema.gov/General-Government/Electrical-Permits/hvtc-3ab9",
    automation: "Official Socrata electrical-permit adapter",
    documents:
      "Metadata available; original drawings require municipal research.",
  },
];
export const COMPARATIVE_CHECKLISTS = [
  {
    name: "NYSERDA model permit",
    jurisdiction: "New York — reference only",
    url: "https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Programs/Clean-Energy-Siting/Battery-Energy-Storage-System-Model-Permit.pdf",
  },
  {
    name: "NYC OTCR battery application checklist",
    jurisdiction: "New York City — reference only",
    url: "https://www.nyc.gov/assets/buildings/pdf/OTCR_battery_app_checklist.pdf",
  },
  {
    name: "Redmond energy storage application",
    jurisdiction: "Redmond, Washington — reference only",
    url: "https://www.redmond.gov/DocumentCenter/View/38052",
  },
  {
    name: "Woodside battery backup submittal checklist",
    jurisdiction: "Woodside, California — reference only",
    url: "https://www.woodsideca.gov/DocumentCenter/View/95/Energy-Storage---Battery-Backup-Systems-Submittal-Requirements-PDF",
  },
];
