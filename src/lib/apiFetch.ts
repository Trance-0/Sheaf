"use client";

/**
 * v0.1.19 — thin client-side fetch wrapper that watches for the
 * "backend needs to be upgraded" signal and dispatches a DOM event so a
 * single global modal component can react.
 *
 * Why not just surface the error in every fetch caller? Because the
 * failure mode is structural (stale Prisma client, schema drift) —
 * every page and panel would need the same UX, and we'd duplicate the
 * "go run prisma generate" copy across each call site. Instead we
 * centralize detection here and let `BackendUpgradePrompt` own the UI.
 *
 * Contract:
 *   - Drop-in replacement for `fetch` (same signature, same return type).
 *   - On 5xx, clones the response body, inspects it for the
 *     `code: "BACKEND_UPGRADE_REQUIRED"` marker the server sets via
 *     `backendUpgradeResponse`, and dispatches the upgrade event.
 *   - Always returns the original Response so existing
 *     `if (!res.ok) throw` error-handling paths still fire and the
 *     caller is free to display whatever inline error it wants.
 */

export const BACKEND_UPGRADE_EVENT = "sheaf:backend-upgrade-required";

export interface BackendUpgradeInfo {
  reason: "prisma-client-stale" | "schema-drift" | string;
  hint: string;
  error: string;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (!response.ok && response.status >= 500) {
    // Clone so the original body remains available to the caller.
    try {
      const clone = response.clone();
      const contentType = clone.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = (await clone.json()) as Partial<BackendUpgradeInfo> & {
          code?: string;
        };
        if (body && body.code === "BACKEND_UPGRADE_REQUIRED") {
          const info: BackendUpgradeInfo = {
            reason: body.reason ?? "unknown",
            hint: body.hint ?? "",
            error: body.error ?? "",
          };
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent<BackendUpgradeInfo>(BACKEND_UPGRADE_EVENT, {
                detail: info,
              }),
            );
          }
        }
      }
    } catch {
      // Non-JSON or already-consumed body — nothing to do. The caller
      // still gets the original response unchanged.
    }
  }

  return response;
}
