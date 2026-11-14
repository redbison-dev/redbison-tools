/** Open-source build: no analytics. Same API as the main repo, no-op. */
export type ToolResultKey = string | number | boolean | null | undefined;
export type ToolResultKind = string;

export function useToolResult(_kind: ToolResultKind, _resultKey: ToolResultKey) {}

export default useToolResult;
