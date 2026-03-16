/**
 * Hook for Composio proxy: getTools (with optional cache), executeTool (entityId from current user), passthrough.
 */

import { useCallback, useRef } from 'react';
import { useUser } from '@/lib/auth';
import {
  getTools as getToolsApi,
  executeTool as executeToolApi,
  passthrough as passthroughApi,
  type OpenAIStyleTool,
  type GetToolsResult,
  type ExecuteToolResult,
} from '@/lib/composio-proxy';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ToolsCacheEntry {
  result: GetToolsResult;
  at: number;
}

export function useComposioProxy() {
  const { data: authData, isPending: authLoading } = useUser();
  const userId = authData?.user?.id ?? null;
  const toolsCacheRef = useRef<Map<string, ToolsCacheEntry>>(new Map());

  const getTools = useCallback(
    async (apps: string[], limit?: number): Promise<GetToolsResult> => {
      const key = [...apps].sort().join(',') + `:${limit ?? 20}`;
      const cached = toolsCacheRef.current.get(key);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.result;
      }
      const result = await getToolsApi(apps, limit);
      toolsCacheRef.current.set(key, { result, at: Date.now() });
      return result;
    },
    []
  );

  const executeTool = useCallback(
    async (
      toolName: string,
      params: Record<string, unknown>,
      explicitUserId?: string
    ): Promise<ExecuteToolResult> => {
      const entityId = explicitUserId ?? userId ?? undefined;
      return executeToolApi(toolName, params, entityId);
    },
    [userId]
  );

  const passthrough = useCallback(
    async (endpoint: string, method: string = 'GET', body?: unknown): Promise<unknown> => {
      return passthroughApi(endpoint, method, body);
    },
    []
  );

  return {
    getTools,
    executeTool,
    passthrough,
    userId,
    isAuthenticated: !!userId,
    authLoading,
  };
}

export type { OpenAIStyleTool, GetToolsResult, ExecuteToolResult };
