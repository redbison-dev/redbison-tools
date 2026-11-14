
import { useCallback } from 'react';
import {
  trackEvent,
  trackToolUsage,
  trackToolOpen,
  trackToolInteraction,
  trackMcpInvocation,
  type ToolInteractionAction,
} from '@/utils/analytics';

export const useAnalytics = () => {
  const track = useCallback((eventName: string, parameters?: { [key: string]: any }) => {
    trackEvent(eventName, parameters);
  }, []);

  /** @deprecated Prefer `trackToolOpenEvent` or `trackToolInteractionEvent`. */
  const trackTool = useCallback((toolName: string, action: string = 'use') => {
    trackToolUsage(toolName, action);
  }, []);

  const trackToolOpenEvent = useCallback((toolName: string, extra?: Record<string, any>) => {
    trackToolOpen(toolName, extra);
  }, []);

  const trackToolInteractionEvent = useCallback(
    (toolName: string, action: ToolInteractionAction, extra?: Record<string, any>) => {
      trackToolInteraction(toolName, action, extra);
    },
    [],
  );

  const trackMcpInvocationEvent = useCallback(
    (
      mcpToolName: string,
      outcome: 'ok' | 'error',
      extra?: {
        pageToolName?: string;
        durationMs?: number;
        correlationId?: string;
        errorCode?: string;
      } & Record<string, any>,
    ) => {
      trackMcpInvocation(mcpToolName, outcome, extra);
    },
    [],
  );

  const trackButtonClick = useCallback((buttonName: string, location?: string) => {
    trackEvent('button_click', {
      event_category: 'ui_interaction',
      button_name: buttonName,
      location: location || 'unknown',
    });
  }, []);

  const trackSearch = useCallback((searchTerm: string) => {
    trackEvent('search', {
      event_category: 'search',
      search_term: searchTerm,
    });
  }, []);

  return {
    track,
    trackTool,
    trackToolOpen: trackToolOpenEvent,
    trackToolInteraction: trackToolInteractionEvent,
    trackMcpInvocation: trackMcpInvocationEvent,
    trackButtonClick,
    trackSearch,
  };
};
