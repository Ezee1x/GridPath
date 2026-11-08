import type { LayerKind } from "./types";
export const GIS_SERVICES: Record<
  LayerKind,
  { url: string; fields: string[]; label: string; geometryType: string }
> = {
  parcels: {
    url: "https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0",
    label: "MassGIS Massachusetts Property Tax Parcels",
    geometryType: "esriGeometryPolygon",
    fields: [
      "OBJECTID",
      "MAP_PAR_ID",
      "LOC_ID",
      "POLY_TYPE",
      "SITE_ADDR",
      "ADDR_NUM",
      "FULL_STR",
      "CITY",
      "ZIP",
      "FY",
      "LAST_EDIT",
      "SOURCE",
      "LOT_SIZE",
      "LOT_UNITS",
      "USE_DESC",
      "USE_CODE",
      "ZONING",
      "TOWN_ID",
      "PROP_ID",
      "TOWNID_UC",
      "NO_MATCH",
    ],
  },
  buildings: {
    url: "https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Building_Structures/FeatureServer/0",
    label: "MassGIS Building Structures",
    geometryType: "esriGeometryPolygon",
    fields: [
      "OBJECTID",
      "STRUCT_ID",
      "SOURCE",
      "SOURCETYPE",
      "SOURCEDATE",
      "SOURCEDATA",
      "AREA_SQ_FT",
      "EDIT_DATE",
      "ARCHIVED",
    ],
  },
  roads: {
    url: "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/MassGIS_Roads_Hosted_Feature_Layer/FeatureServer/0",
    label: "MassGIS Roads",
    geometryType: "esriGeometryPolyline",
    fields: [
      "OBJECTID",
      "RCL_UNQ_ID",
      "ST_NAME_STD",
      "ROAD_CLASS",
      "MUNI_L",
      "MUNI_R",
      "DATA_SRC",
      "DATE_UPD",
      "EFF_DATE",
    ],
  },
};
// Census jurisdiction check uses detailed state geometry, not a rectangular MA bounding box.
export const STATE_SERVICE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0";
export const CANDIDATE_RADIUS_METERS = 150;
export const MAX_FEATURES = 300;
