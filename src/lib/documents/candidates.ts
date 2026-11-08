import type { JsonValue } from "../intake/types";
export interface DocumentCandidate {
  fieldId: string;
  value: JsonValue;
  unit: string | null;
  page: number;
  quote: string;
  method: string;
  confidence: "Estimated";
}
interface Pattern {
  fieldId: string;
  unit: string | null;
  pattern: RegExp;
  value?: (raw: string) => JsonValue;
}
const numeric = (raw: string) =>
  /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : raw.replace(/\s/g, "");
const transformer = (key: string) => (raw: string) => ({
  transformers: [{ [key]: numeric(raw) }],
});
const attribute = (key: string) => (raw: string) => ({ [key]: raw.trim() });
const patterns: Pattern[] = [
  {
    fieldId: "voltage",
    unit: "V",
    pattern:
      /\bservice\s+voltage\s*[:=\-]?\s*(\d{2,4}(?:\s*\/\s*\d{2,4})?)\s*v(?:olts?)?\b/gi,
  },
  {
    fieldId: "serviceAmperage",
    unit: "A",
    pattern:
      /\bservice\s+(?:amperage|amps|rating)\s*[:=\-]?\s*(\d{2,5})\s*a(?:mps?)?\b/gi,
  },
  {
    fieldId: "panelRating",
    unit: "A",
    pattern:
      /\b(?:main\s+distribution\s+panel|panel\s+rating)\s*[:=\-]?\s*(\d{2,5})\s*a(?:mps?)?\b/gi,
  },
  {
    fieldId: "phase",
    unit: null,
    pattern:
      /(?:\bservice\s+phase|\bphase\s+configuration|(?:^|[\n.;])\s*phase)\s*[:=\-]?\s*([13])\b/gi,
  },
  {
    fieldId: "phase",
    unit: null,
    pattern:
      /\b(?:service\s+wire\s+count|wire\s+configuration)\s*[:=\-]?\s*(\d)\s*(?:wires?)?\b/gi,
    value: (r) => ({ serviceWireCount: Number(r) }),
  },
  {
    fieldId: "breaker",
    unit: null,
    pattern:
      /\bmain\s+breaker(?:\s+rating)?\s*[:=\-]?\s*(\d{2,5})\s*A(?:mps?)?\b/gi,
    value: (r) => ({ mainBreakerAmps: Number(r) }),
  },
  {
    fieldId: "breaker",
    unit: null,
    pattern:
      /\b(?:main\s+)?bus\s+rating\s*[:=\-]?\s*(\d{2,5})\s*A(?:mps?)?\b/gi,
    value: (r) => ({ mainBusAmps: Number(r) }),
  },
  {
    fieldId: "panelRating",
    unit: null,
    pattern:
      /\b(?:panel|switchboard)\s+manufacturer\s*[:=]\s*([^\n;.,]{2,60})/gi,
    value: attribute("manufacturer"),
  },
  {
    fieldId: "breakerSpace",
    unit: null,
    pattern: /\bavailable\s+breaker\s+spaces\s*[:=]\s*(\d{1,3})\b/gi,
    value: (r) => ({ availableSpaces: Number(r) }),
  },
  {
    fieldId: "transformerCapacity",
    unit: null,
    pattern:
      /\btransformer\s+(?:capacity|rating)\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*kVA\b/gi,
    value: transformer("capacityKva"),
  },
  {
    fieldId: "transformerCapacity",
    unit: null,
    pattern:
      /\btransformer\s+primary\s+voltage\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*V\b/gi,
    value: transformer("primaryVoltageV"),
  },
  {
    fieldId: "transformerCapacity",
    unit: null,
    pattern:
      /\btransformer\s+secondary\s+voltage\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*V\b/gi,
    value: transformer("secondaryVoltageV"),
  },
  {
    fieldId: "transformerCapacity",
    unit: null,
    pattern: /\btransformer\s+phase\s*[:=\-]?\s*([13])\b/gi,
    value: transformer("phase"),
  },
  {
    fieldId: "transformerId",
    unit: null,
    pattern: /\btransformer\s+manufacturer\s*[:=]\s*([^\n;.,]{2,60})/gi,
    value: attribute("manufacturer"),
  },
  {
    fieldId: "transformerId",
    unit: null,
    pattern:
      /\btransformer\s+(?:model|catalog(?:\s+number)?)\s*[:=]\s*([A-Z0-9_/-]{2,60})/gi,
    value: attribute("modelOrCatalogNumber"),
  },
  {
    fieldId: "transformerId",
    unit: null,
    pattern:
      /\btransformer\s+(?:identifier|id|equipment\s+id)\s*[:=]\s*([A-Z0-9_/-]{2,60})/gi,
    value: attribute("equipmentId"),
  },
  {
    fieldId: "meterModel",
    unit: null,
    pattern:
      /\b(?:revenue\s+)?meter\s+manufacturer\s*[:=]\s*([^\n;.,]{2,60})/gi,
    value: attribute("manufacturer"),
  },
  {
    fieldId: "meterModel",
    unit: null,
    pattern: /\b(?:revenue\s+)?meter\s+model\s*[:=]\s*([A-Z0-9_/-]{2,60})/gi,
    value: attribute("model"),
  },
  {
    fieldId: "meterId",
    unit: null,
    pattern:
      /\b(?:revenue\s+)?meter\s+(?:identifier|id)\s*[:=]\s*([A-Z0-9_/-]{2,60})/gi,
    value: attribute("identifier"),
  },
  {
    fieldId: "meterModel",
    unit: null,
    pattern: /\bmeter\s+(?:electrical\s+)?rating\s*[:=]\s*([^\n;.,]{2,60})/gi,
    value: attribute("visibleElectricalRating"),
  },
  {
    fieldId: "utilityPole",
    unit: null,
    pattern:
      /\b(?:utility\s+)?pole\s+(?:identifier|id)\s*[:=]\s*([A-Z0-9_/-]{2,60})/gi,
    value: (r) => ({ poles: [{ identifier: r }] }),
  },
  {
    fieldId: "poi",
    unit: null,
    pattern:
      /\bCT\s+cabinet\s*(?:identifier|id|location)\s*[:=]\s*([^\n;.]{2,80})/gi,
    value: (r) => ({ ctCabinet: r.trim() }),
  },
  {
    fieldId: "room",
    unit: null,
    pattern: /\belectrical\s+room\s+location\s*[:=]\s*([^\n;.]{2,100})/gi,
    value: (r) => r.trim(),
  },
  {
    fieldId: "poi",
    unit: null,
    pattern:
      /\bexisting\s+point.of.interconnection\s*[:=]\s*([^\n;.]{2,100})/gi,
    value: (r) => r.trim(),
  },
  {
    fieldId: "singleLine",
    unit: null,
    pattern:
      /\bexisting\s+(?:electrical\s+)?single.line\s+diagram\s*(?:revision|reference|sheet)\s*[:=]\s*([A-Z0-9_./-]{2,60})/gi,
    value: (r) => ({
      availability: "Unknown — diagram reference only; verify availability",
      documentReference: r,
    }),
  },
];
export function extractCandidates(
  pages: { page: number; text: string }[],
): DocumentCandidate[] {
  const result: DocumentCandidate[] = [];
  for (const { page, text } of pages)
    for (const definition of patterns) {
      definition.pattern.lastIndex = 0;
      for (const match of text.matchAll(definition.pattern)) {
        const raw = match[1].trim(),
          value = definition.value ? definition.value(raw) : numeric(raw);
        if (typeof value === "number" && value <= 0) continue;
        const quote = text
          .slice(
            Math.max(0, match.index! - 50),
            Math.min(text.length, match.index! + match[0].length + 50),
          )
          .trim();
        if (
          !result.some(
            (c) =>
              c.fieldId === definition.fieldId &&
              JSON.stringify(c.value) === JSON.stringify(value) &&
              c.page === page,
          )
        )
          result.push({
            fieldId: definition.fieldId,
            value,
            unit: definition.unit,
            page,
            quote,
            method:
              "Explicit labelled document text; no capacity, service relationship or installed condition inferred.",
            confidence: "Estimated",
          });
        if (result.length >= 100) return result;
      }
    }
  return result;
}
