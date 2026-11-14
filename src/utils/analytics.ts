/**
 * Open-source build: analytics are intentionally absent. The hosted site at
 * redbison.dev reports anonymous usage events; this repo keeps the same API
 * as no-ops so tool components are byte-identical with the main repo.
 */
export const initGA = (_measurementId?: string) => {};
export const trackEvent = (_eventName: string, ..._rest: any[]) => {};
export const captureException = (_error: unknown, ..._rest: any[]) => {};
export const trackPageView = (_pathname: string) => {};
export const trackToolUsage = (_toolName: string, _action?: string) => {};
export type ToolInteractionAction = string;
export const TOOL_FUNNEL_STEP = { open: 1, interact: 2, result: 3 } as const;
export const trackToolOpen = (_toolName: string, _extra?: Record<string, unknown>) => {};
export const trackToolInteraction = (_toolId: string, _action?: string, ..._rest: any[]) => {};
export const trackMcpInvocation = (..._args: unknown[]) => {};
export const TOOL_RESULT_KINDS = ['calculated', 'converted', 'generated', 'validated', 'formatted', 'analyzed', 'copied', 'downloaded'] as const;
export type ToolResultKind = string;
export const TOOL_RESULT_SETTLE_MS = 2000;
export const TOOL_RESULT_PAGE_CAP = 30;
export const isToolResultKind = (_kind: unknown): boolean => true;
export function beginToolResultPageView(_path: string) {}
export function noteToolEngagement(_path: string) {}
export function hasToolEngagement(_path: string): boolean { return false; }
export const trackToolResult = (..._args: unknown[]) => {};
