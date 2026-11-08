import { writeFileSync } from "node:fs";
import { discoverElectrical } from "../src/lib/electrical/adapters";
import { siteRecordKey } from "../src/lib/intake/model";
const sites = [
  {
    name: "Holliston",
    address: "79 Lowland Street, Holliston, MA",
    parcelFeatureId: "2251987",
    townId: 136,
  },
  {
    name: "Worcester",
    address: "50 Foster Street, Worcester, MA",
    parcelFeatureId: null,
    townId: 348,
  },
  {
    name: "Boston",
    address: "200 Clarendon Street, Boston, MA",
    parcelFeatureId: "2380675",
    parcelId: "0401134000",
    townId: 35,
  },
  {
    name: "Concord municipal utility",
    address: "300 Baker Avenue, Concord, MA",
    parcelFeatureId: null,
    townId: 67,
  },
  {
    name: "Reading municipal utility",
    address: "25 Haven Street, Reading, MA",
    parcelFeatureId: null,
    townId: 246,
  },
];
async function main() {
  const results = await Promise.all(
    sites.map(async (site) => {
      const result = await discoverElectrical({
        ...site,
        siteKey: siteRecordKey(`qa-${site.name}`, site.parcelFeatureId),
      });
      const report = {
        address: site.address,
        retrievedAt: result.retrievedAt,
        publicAddress: result.publicAddress,
        municipality: result.municipality,
        candidates: result.utilityCandidates,
        adapters: result.adapters,
        permitCount: result.permits.length,
        samplePermit: result.permits[0] ?? null,
        populatedObservationFields: result.observations.map((o) => o.fieldId),
        originalSources: result.sources,
      };
      console.log(
        site.name,
        JSON.stringify({
          candidates: result.utilityCandidates.map((c) => c.name),
          permits: result.permits.length,
          statuses: result.adapters.map((a) => `${a.adapter}: ${a.status}`),
        }),
      );
      return report;
    }),
  );
  writeFileSync(
    "docs/electrical/LIVE_SOURCE_TESTS.json",
    JSON.stringify(results, null, 2),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
