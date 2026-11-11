import { supabase } from "../lib/supabase";

const localBrowser =
  import.meta.env.DEV &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const configuredApiUrl = import.meta.env.VITE_ORB_API_URL;
const configuredAgentApiUrl = import.meta.env.VITE_AGENT_API_URL;
// Set VITE_ORB_API_URL to the public API origin when the frontend and API are
// deployed separately (for example, Vercel -> Railway). An empty production
// value is only valid when `/api` is proxied through the same deployment.
const baseUrl = (
  configuredApiUrl || (localBrowser ? "http://127.0.0.1:8000" : "")
).replace(/\/$/, "");
const agentBaseUrl = (configuredAgentApiUrl || "").replace(/\/$/, "");
const mockAuth = import.meta.env.VITE_AUTH_MODE === "mock";
export const hasOrbApi = Boolean(
  configuredApiUrl || localBrowser || !import.meta.env.DEV,
);

// Global templates change rarely, but the manager can mount several times as
// users navigate between flows and templates. Cache them briefly and let
// concurrent consumers share the same request instead of showing a loader.
const FLOW_TEMPLATE_CACHE_MS = 30_000;
const flowTemplateCache = new Map();
const flowTemplateRequests = new Map();
const flowTemplateCacheKey = ({ categoryCode, includeAll = false } = {}) =>
  `${includeAll ? "all" : "published"}:${categoryCode || "all"}`;
const invalidateFlowTemplateCache = () => {
  flowTemplateCache.clear();
};

// Keep an in-memory, per-signed-in-user cache for the views people revisit
// during one workspace session. This avoids repeat Railway/Qdrant round trips
// when moving between Overview, AI's Brain, Products, Flows, and Operations.
// It intentionally does not use localStorage: cached knowledge is discarded
// on a refresh, sign-out, or new browser session.
const apiReadCache = new Map();
const apiReadRequests = new Map();
let apiReadCacheEpoch = 0;
const clearApiReadCache = () => {
  apiReadCacheEpoch += 1;
  apiReadCache.clear();
  apiReadRequests.clear();
};

const request = async (path, options = {}) => {
  if (!hasOrbApi) return null;
  const { cacheTtl = 0, invalidateCache = true, ...fetchOptions } = options;
  const { data } = await supabase?.auth.getSession();
  const token = data?.session?.access_token;
  if (!token && !localBrowser && !mockAuth)
    throw new Error("Sign in again to access brand knowledge.");
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const requestEpoch = apiReadCacheEpoch;
  const cacheKey = `${data?.session?.user?.id || "anonymous"}:${path}`;
  const cached = method === "GET" && cacheTtl ? apiReadCache.get(cacheKey) : null;
  if (cached && Date.now() - cached.savedAt < cacheTtl) return cached.data;
  if (method === "GET" && cacheTtl && apiReadRequests.has(cacheKey))
    return apiReadRequests.get(cacheKey);

  const run = async () => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        ...(fetchOptions.headers || {}),
      },
    });
    if (!response.ok)
      throw new Error(
        (await response.json().catch(() => null))?.detail ||
          "Orb API request failed.",
      );
    if (response.status === 204) return null;
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(
        "Orb API returned a non-JSON response. Set VITE_ORB_API_URL to the public Railway orb-api domain and redeploy the frontend.",
      );
    }
    const payload = await response.json();
    if (method === "GET" && cacheTtl && requestEpoch === apiReadCacheEpoch)
      apiReadCache.set(cacheKey, { savedAt: Date.now(), data: payload });
    if (method !== "GET" && invalidateCache) clearApiReadCache();
    return payload;
  };
  if (method !== "GET" || !cacheTtl) return run();
  const pending = run().finally(() => apiReadRequests.delete(cacheKey));
  apiReadRequests.set(cacheKey, pending);
  return pending;
};

// The deployed support-agent API is intentionally separate from Orb's admin
// API. It owns per-brand conversation memory and does not receive Supabase
// credentials from the browser.
const agentErrorDetail = (value) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map(
        (item) =>
          item?.msg || item?.message || (typeof item === "string" ? item : ""),
      )
      .filter(Boolean)
      .join(" ");
  }
  if (value && typeof value === "object")
    return value.message || value.detail || "";
  return "";
};

const agentRequest = async (path, options = {}) => {
  if (!agentBaseUrl) return null;
  const response = await fetch(`${agentBaseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      agentErrorDetail(payload?.detail || payload?.message) ||
        `Support agent request failed (${response.status}).`,
    );
  }
  return payload;
};

export const activeBrandName = () =>
  window.localStorage.getItem("orb_selected_brand_name") || "";

// Multipart is deliberately kept out of `request`: setting application/json
// there would corrupt the browser-generated FormData boundary. The Slack bot
// token remains server-side; this only carries the signed-in user's session.
export const sendSlackEscalation = async (
  { message, files = [] },
  brandName = activeBrandName(),
) => {
  if (!hasOrbApi) throw new Error("Orb API is unavailable.");
  const { data } = await supabase?.auth.getSession();
  const token = data?.session?.access_token;
  if (!token && !localBrowser && !mockAuth)
    throw new Error("Sign in again to send an escalation.");
  const body = new FormData();
  body.append("brand_name", brandName);
  body.append("message", message.trim());
  files.forEach((file) => body.append("files", file));
  const response = await fetch(`${baseUrl}/api/escalations/slack`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || "Could not send the Slack escalation.");
  }
  return response.json();
};
export const listRemoteBrands = () => request("/api/brands", { cacheTtl: 60_000 });
export const listBrandCategories = () => request("/api/categories", { cacheTtl: 300_000 });
export const setRemoteBrandCategory = (brandId, industryCategory) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/category`, {
    method: "PATCH",
    body: JSON.stringify({ industry_category: industryCategory }),
  });
export const setRemoteBrandProfile = (brandId, profile) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/profile`, {
    method: "PATCH",
    body: JSON.stringify(profile),
  });
export const getRemoteBrandAgentConnection = (brandId) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/agent-connection`, {
    cacheTtl: 0,
  });
export const setRemoteBrandAgentConnection = (brandId, connection) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/agent-connection`, {
    method: "PATCH",
    body: JSON.stringify(connection),
  });
export const askOrbGuide = (payload) =>
  request("/api/orb-guide", { method: "POST", body: JSON.stringify(payload), invalidateCache: false });
export const draftOrbWork = (payload) =>
  request("/api/orb-guide/draft", { method: "POST", body: JSON.stringify(payload), invalidateCache: false });
export const chatWithDeployedAgent = (brandId, payload) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/agent/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
    invalidateCache: false,
  });
export const hasBrandAgentApi = Boolean(agentBaseUrl);
export const chatWithBrandAgent = async (brandId, payload) => {
  const safeBrandId = encodeURIComponent(brandId);
  if (agentBaseUrl)
    return agentRequest(`/api/v1/brands/${safeBrandId}/chat`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  const result = await chatWithDeployedAgent(brandId, payload);
  return { ...result, response: result?.response || result?.reply || "" };
};
export const getBrandChatHistory = (brandId, sessionId) =>
  agentRequest(
    `/api/v1/brands/${encodeURIComponent(brandId)}/history?session_id=${encodeURIComponent(sessionId)}`,
  );
export const clearBrandChatHistory = (brandId, sessionId) =>
  agentRequest(
    `/api/v1/brands/${encodeURIComponent(brandId)}/history?session_id=${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
export const listBrandAgentFeedback = (brandId, sessionId) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/agent-feedback${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`, {
    cacheTtl: 0,
  });
export const createBrandAgentFeedback = (brandId, payload) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/agent-feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const updateBrandAgentFeedback = (brandId, feedbackId, payload) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/agent-feedback/${encodeURIComponent(feedbackId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
export const syncBrandAgentSettings = (brandId, payload) =>
  agentRequest(`/api/v1/brands/${encodeURIComponent(brandId)}/agent`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
export const getBrandVoice = (brandId) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/voice`, { cacheTtl: 30_000 });
export const importBrandVoiceSource = (brandId, source) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/voice/sources`, {
    method: "POST",
    body: JSON.stringify(source),
  });
export const deleteBrandVoiceSource = (brandId, sourceId) =>
  request(
    `/api/brands/${encodeURIComponent(brandId)}/voice/sources/${encodeURIComponent(sourceId)}`,
    { method: "DELETE" },
  );
export const generateBrandVoice = (brandId) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/voice/generate`, {
    method: "POST",
  });
export const createManualBrandVoiceProfile = (brandId, profile) =>
  request(`/api/brands/${encodeURIComponent(brandId)}/voice/profiles/manual`, {
    method: "POST",
    body: JSON.stringify(profile),
  });
export const approveBrandVoice = (brandId, profileId, profile) =>
  request(
    `/api/brands/${encodeURIComponent(brandId)}/voice/profiles/${encodeURIComponent(profileId)}/approve`,
    { method: "PATCH", body: JSON.stringify(profile) },
  );
export const listKnowledge = (
  kind,
  brandName = activeBrandName(),
  limit = 500,
) =>
  brandName
    ? request(
        `/api/knowledge/${kind}?brand_name=${encodeURIComponent(brandName)}&limit=${Math.min(500, Math.max(1, Number(limit) || 500))}`,
        { cacheTtl: 45_000 },
      )
    : Promise.resolve(null);
export const updateKnowledge = (
  kind,
  id,
  payload,
  brandName = activeBrandName(),
) =>
  request(`/api/knowledge/${kind}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ brand_name: brandName, payload }),
  });
export const createAssistantFaq = ({ question, answer, category = "Customer support" }, brandName = activeBrandName()) =>
  request("/api/knowledge/faqs/manual", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, question, answer, category }),
  });
export const createSopFromFlow = (flow, brandName = activeBrandName()) =>
  request("/api/knowledge/sops/from-flow", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, flow }),
  });
export const publishApprovedKnowledge = (kind, brandName = activeBrandName()) =>
  request(`/api/knowledge/${kind}/publish-approved`, {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName }),
  });
export const deleteKnowledge = (kind, id, brandName = activeBrandName()) =>
  request(
    `/api/knowledge/${kind}/${encodeURIComponent(id)}?brand_name=${encodeURIComponent(brandName)}`,
    { method: "DELETE" },
  );
export const listFlows = (brandName = activeBrandName()) =>
  brandName
    ? request(`/api/flows?brand_name=${encodeURIComponent(brandName)}`, { cacheTtl: 45_000 })
    : Promise.resolve(null);
export const listOperationalUpdates = (brandName = activeBrandName()) =>
  brandName
    ? request(`/api/operations?brand_name=${encodeURIComponent(brandName)}`, { cacheTtl: 30_000 })
    : Promise.resolve({ updates: [] });
export const createOperationalUpdate = (message, brandName = activeBrandName()) =>
  request("/api/operations", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, message }),
  });
// The operations API does not yet expose an expiry-update endpoint. Keep this
// service boundary so the Overview can use the real endpoint as soon as it is
// available, while the current UI updates its local operation row safely.
export const extendOperation = async (id, newExpiresAt) => ({
  id,
  expires_at: newExpiresAt,
  mock: true,
});
export const listMessageTemplates = (brandName = activeBrandName()) =>
  brandName
    ? request(`/api/templates?brand_name=${encodeURIComponent(brandName)}`, { cacheTtl: 30_000 })
    : Promise.resolve({ templates: [] });
export const syncZokoTemplates = (brandName = activeBrandName(), action = "sync") =>
  request("/api/templates/sync", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, action }),
  });
export const listFlowTemplates = (options = {}) => {
  const { categoryCode, includeAll = false } = options;
  const key = flowTemplateCacheKey(options);
  const cached = flowTemplateCache.get(key);
  if (cached && Date.now() - cached.savedAt < FLOW_TEMPLATE_CACHE_MS)
    return Promise.resolve(cached.data);
  if (flowTemplateRequests.has(key)) return flowTemplateRequests.get(key);

  const requestPromise = request(
    `/api/flows/templates?${new URLSearchParams({ ...(categoryCode ? { category_code: categoryCode } : {}), ...(includeAll ? { include_all: "true" } : {}) })}`,
  )
    .then((data) => {
      flowTemplateCache.set(key, { data, savedAt: Date.now() });
      return data;
    })
    .finally(() => flowTemplateRequests.delete(key));
  flowTemplateRequests.set(key, requestPromise);
  return requestPromise;
};
export const createFlowTemplate = async ({ categoryCode, payload }) => {
  const result = await request("/api/flows/templates", {
    method: "POST",
    body: JSON.stringify({ category_code: categoryCode, payload }),
  });
  invalidateFlowTemplateCache();
  return result;
};
export const updateFlowTemplate = async (id, { categoryCode, payload }) => {
  const result = await request(`/api/flows/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ category_code: categoryCode, payload }),
  });
  invalidateFlowTemplateCache();
  return result;
};
export const deleteFlowTemplate = async (id) => {
  const result = await request(`/api/flows/templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  invalidateFlowTemplateCache();
  return result;
};
export const assistFlow = (prompt, brandName = activeBrandName()) =>
  request("/api/flows/assist", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, prompt }),
  });
export const createFlow = (payload, brandName = activeBrandName()) =>
  request("/api/flows", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, payload }),
  });
export const updateFlow = (id, payload, brandName = activeBrandName()) =>
  request(`/api/flows/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ brand_name: brandName, payload }),
  });
export const deleteFlow = (id, brandName = activeBrandName()) =>
  request(
    `/api/flows/${encodeURIComponent(id)}?brand_name=${encodeURIComponent(brandName)}`,
    { method: "DELETE" },
  );
export const createCrawlPipeline = ({
  url,
  brandId,
  maxPages = 100,
  outputs = ["sops", "faqs", "products"],
}) =>
  request("/api/crawls", {
    method: "POST",
    body: JSON.stringify({
      start_url: url,
      brand_id: brandId || null,
      max_pages: maxPages,
      outputs,
    }),
  });
export const listPipelines = (brandId) =>
  request(`/api/pipelines?brand_id=${encodeURIComponent(brandId)}`);
export const getPipeline = (pipelineId) =>
  request(`/api/pipelines/${encodeURIComponent(pipelineId)}`);
export const startPipelineGeneration = (pipelineId) =>
  request(`/api/pipelines/${encodeURIComponent(pipelineId)}/generate`, {
    method: "POST",
  });
export const pausePipeline = (pipelineId) =>
  request(`/api/pipelines/${encodeURIComponent(pipelineId)}/pause`, {
    method: "POST",
  });
export const resumePipeline = (pipelineId) =>
  request(`/api/pipelines/${encodeURIComponent(pipelineId)}/resume`, {
    method: "POST",
  });
export const cancelPipeline = (pipelineId) =>
  request(`/api/pipelines/${encodeURIComponent(pipelineId)}/cancel`, {
    method: "POST",
  });
export const getCrawl = (crawlJobId) =>
  request(`/api/crawls/${encodeURIComponent(crawlJobId)}`);
export const listCrawlUrls = (crawlJobId, { limit = 100, status } = {}) =>
  request(
    `/api/crawls/${encodeURIComponent(crawlJobId)}/urls?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
  );
export const listCrawlPages = (crawlJobId, { limit = 100 } = {}) =>
  request(`/api/crawls/${encodeURIComponent(crawlJobId)}/pages?limit=${limit}`);
export const getCrawlPageContent = (crawlJobId, url) =>
  request(
    `/api/crawls/${encodeURIComponent(crawlJobId)}/pages/content?url=${encodeURIComponent(url)}`,
  );
export const pauseCrawl = (crawlJobId) =>
  request(`/api/crawls/${encodeURIComponent(crawlJobId)}/pause`, {
    method: "POST",
  });
export const resumeCrawl = (crawlJobId) =>
  request(`/api/crawls/${encodeURIComponent(crawlJobId)}/resume`, {
    method: "POST",
  });
export const cancelCrawl = (crawlJobId) =>
  request(`/api/crawls/${encodeURIComponent(crawlJobId)}/cancel`, {
    method: "POST",
  });
export const getShopifyCredentialStatus = (brandName) =>
  request(
    `/api/shopify/credentials?brand_name=${encodeURIComponent(brandName)}`,
  );
export const importShopifySource = ({
  domain,
  accessToken,
  brandId,
  brandName,
  useVault = true,
  maximum = 100,
  outputs = ["sops", "faqs", "products"],
}) =>
  request("/api/shopify/import", {
    method: "POST",
    body: JSON.stringify({
      domain: domain || null,
      access_token: accessToken || null,
      brand_id: brandId || null,
      brand_name: brandName || null,
      use_vault: useVault,
      maximum,
      outputs,
    }),
  });
export const syncShopifyProducts = ({ brandName, maximum = 250 }) =>
  request("/api/shopify/products/sync", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, use_vault: true, maximum }),
  });
export const getShopifyProductTemplates = ({ brandName }) =>
  request(
    `/api/shopify/products/theme-templates?brand_name=${encodeURIComponent(brandName)}`,
  );
export const getShopifyProductMetafields = ({ brandName, productId }) =>
  request(
    `/api/shopify/products/${encodeURIComponent(productId)}/metafields?brand_name=${encodeURIComponent(brandName)}`,
  );
export const getShopifyVariantMetafields = ({
  brandName,
  productId,
  variantId,
}) =>
  request(
    `/api/shopify/products/${encodeURIComponent(productId)}/variant-metafields?brand_name=${encodeURIComponent(brandName)}&variant_id=${encodeURIComponent(variantId)}`,
  );
export const saveShopifyProductMetafields = ({
  brandName,
  productId,
  ownerId,
  metafields,
  deletedMetafieldIds = [],
}) =>
  request("/api/shopify/products/metafields/save", {
    method: "POST",
    body: JSON.stringify({
      brand_name: brandName,
      product_id: productId,
      owner_id: ownerId || undefined,
      metafields,
      deleted_metafield_ids: deletedMetafieldIds,
      use_vault: true,
    }),
  });
export const applyAssistantAvailabilityUpdate = (message, brandName = activeBrandName()) =>
  request("/api/shopify/products/assistant-availability", {
    method: "POST",
    body: JSON.stringify({ brand_name: brandName, message }),
  });

export const getBrandMastersheetUrl = async (brandName = activeBrandName()) => {
  if (!brandName) return null;
  // 1. Check brand profile settings via backend REST or Supabase
  try {
    if (supabase) {
      const { data, error } = await supabase
        .schema("cx_copilot")
        .from("brands")
        .select("id, name, platform_config")
        .ilike("name", brandName)
        .limit(1);

      if (!error && data?.[0]?.platform_config) {
        const config = typeof data[0].platform_config === "string"
          ? JSON.parse(data[0].platform_config)
          : data[0].platform_config;
        if (config?.mastersheet_url || config?.sheets_mastersheet_url) {
          return config.mastersheet_url || config.sheets_mastersheet_url;
        }
      }
    }
  } catch {
    // Graceful fallback
  }

  // 2. Brand-scoped local fallback if configured during current workspace session
  try {
    const local = window.localStorage.getItem(`orb:mastersheet_url:${brandName}`);
    if (local) return local;
  } catch {
    // Ignore storage errors
  }

  return null;
};

export const saveBrandMastersheetConfig = async ({
  brandName = activeBrandName(),
  brandId,
  mastersheetUrl,
}) => {
  const cleanUrl = String(mastersheetUrl || "").trim();
  // 1. Try to save to Supabase / Railway platform_config
  let persistedRemotely = false;
  try {
    if (supabase && (brandId || brandName)) {
      // Find brand ID if not provided
      let targetBrandId = brandId;
      if (!targetBrandId) {
        const { data: brandData } = await supabase
          .schema("cx_copilot")
          .from("brands")
          .select("id, platform_config")
          .ilike("name", brandName)
          .limit(1);
        if (brandData?.[0]) {
          targetBrandId = brandData[0].id;
          const currentConfig = typeof brandData[0].platform_config === "string"
            ? JSON.parse(brandData[0].platform_config)
            : (brandData[0].platform_config || {});
          
          const updatedConfig = {
            ...currentConfig,
            mastersheet_url: cleanUrl,
            sheets_mastersheet_url: cleanUrl,
            sheets_connected: Boolean(cleanUrl),
            updated_at: new Date().toISOString(),
          };

          const { error: updateError } = await supabase
            .schema("cx_copilot")
            .from("brands")
            .update({ platform_config: updatedConfig })
            .eq("id", targetBrandId);

          if (!updateError) persistedRemotely = true;
        }
      } else {
        const { data: brandData } = await supabase
          .schema("cx_copilot")
          .from("brands")
          .select("platform_config")
          .eq("id", targetBrandId)
          .limit(1);
        
        const currentConfig = typeof brandData?.[0]?.platform_config === "string"
          ? JSON.parse(brandData[0].platform_config)
          : (brandData?.[0]?.platform_config || {});

        const updatedConfig = {
          ...currentConfig,
          mastersheet_url: cleanUrl,
          sheets_mastersheet_url: cleanUrl,
          sheets_connected: Boolean(cleanUrl),
          updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .schema("cx_copilot")
          .from("brands")
          .update({ platform_config: updatedConfig })
          .eq("id", targetBrandId);

        if (!updateError) persistedRemotely = true;
      }
    }
  } catch (err) {
    console.warn("Could not save mastersheet config to Supabase/Railway vault:", err);
  }

  // Also persist in brand-scoped local cache and emit event
  try {
    if (cleanUrl) {
      window.localStorage.setItem(`orb:mastersheet_url:${brandName}`, cleanUrl);
    } else {
      window.localStorage.removeItem(`orb:mastersheet_url:${brandName}`);
    }
    window.dispatchEvent(new CustomEvent("orb:mastersheet-updated", { detail: { brandName, url: cleanUrl } }));
  } catch {}

  return { success: true, url: cleanUrl, persistedRemotely };
};

