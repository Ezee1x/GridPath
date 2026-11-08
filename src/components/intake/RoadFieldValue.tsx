import type { JsonValue } from "@/lib/intake/types";
import { valueText } from "@/lib/intake/format-value";
import { roadNames, roadClassGroups } from "@/lib/intake/road-display";

export function RoadFieldValue({
  fieldId,
  value,
}: {
  fieldId: string;
  value: JsonValue;
}) {
  const names = fieldId === "roadNames" ? roadNames(value) : null;
  if (names)
    return (
      <div className="road-value">
        <div className="road-name-list">
          {names.slice(0, 4).map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        {names.length > 4 && (
          <details>
            <summary>Show {names.length - 4} more roads</summary>
            <div className="road-name-list">
              {names.slice(4).map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </details>
        )}
        {!names.length && "Not retrieved"}
      </div>
    );
  const groups = fieldId === "roadClass" ? roadClassGroups(value) : null;
  if (groups?.length)
    return (
      <div className="road-value">
        {groups.map((group) => (
          <details key={group.code}>
            <summary>
              {group.label}{" "}
              <span className="road-count">
                · {group.names.length}{" "}
                {group.names.length === 1 ? "road" : "roads"}
              </span>
            </summary>
            <div className="road-name-list">
              {group.names.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  return <>{valueText(value)}</>;
}
