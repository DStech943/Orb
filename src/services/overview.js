/**
 * useOverview — single data hook for the Overview page (/app).
 *
 * Shape returned:
 *   { user:       { firstName },
 *     brand:      { id, name, platform: "shopify" | "other" },
 *     counts:     { sops: { published, drafts },
 *                   faqs: { published, drafts },
 *                   flows: { published, drafts } },
 *     products:   [{ id, title, imageUrl, price, coverage? }] | null,
 *     operations: [{ id, title, kind, expiresAt, agentBehaviour }],
 *     setup:      { steps: [{ key, label, done }], completedAt | null },
 *     flags:      { sourceCount, lastSyncedAt, failedPages } }
 *
 * Real services  : listKnowledge, listFlows, listOperationalUpdates (orbApi)
 * [MOCK] sections: brand.platform, setup step inference, all flags fields,
 *                  products.coverage — clearly marked so the backend can
 *                  replace them without touching the UI.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  activeBrandName,
  hasOrbApi,
  listFlows,
  listKnowledge,
  listOperationalUpdates,
} from './orbApi'
import { getOverviewData } from './generation'

// ─── Utilities ────────────────────────────────────────────────────────────────

function deriveFirstName(user) {
  const raw = user?.name || user?.email?.split('@')[0] || ''
  const word = raw
    .replace(/\d+/g, '')
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(' ')[0]
  if (!word) return 'there'
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

const isPublishedStatus = (status) =>
  ['published', 'active'].includes(String(status || '').toLowerCase())

const isApprovedStatus = (status) => String(status || '').toLowerCase() === 'approved'

function splitByStatus(points) {
  let published = 0
  let drafts = 0
  let approved = 0
  for (const p of points) {
    const s = p?.payload?.status ?? p?.status
    if (isPublishedStatus(s)) published++
    else if (isApprovedStatus(s)) approved++
    else drafts++
  }
  return { published, drafts, approved }
}

const safePoints = (result) =>
  Array.isArray(result?.points) ? result.points : []

const safeFlows = (result) =>
  Array.isArray(result)
    ? result
    : Array.isArray(result?.points)
      ? result.points
      : []

// [MOCK] Simulated latency for the localStorage path.
// Remove when the backend exposes a real /api/overview endpoint.
const mockDelay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))

// [MOCK] Setup step definitions — replace with /api/setup when ready.
const SETUP_STEP_DEFS = [
  { key: 'source',  label: 'Connect a knowledge source' },
  { key: 'review',  label: 'Review generated SOPs & FAQs' },
  { key: 'publish', label: 'Publish approved knowledge' },
  { key: 'agent',   label: 'Connect your support agent' },
]

// ─── API path ─────────────────────────────────────────────────────────────────

async function fetchViaApi(brandName, user) {
  const [sopsR, faqsR, flowsR, opsR, productsR] = await Promise.allSettled([
    listKnowledge('sops', brandName),
    listKnowledge('faqs', brandName),
    listFlows(brandName),
    listOperationalUpdates(brandName),
    listKnowledge('products', brandName),
  ])

  const ok = (r, fallback) => (r?.status === 'fulfilled' ? r.value : fallback)

  const sopsPoints     = safePoints(ok(sopsR, null))
  const faqsPoints     = safePoints(ok(faqsR, null))
  const flowsArr       = safeFlows(ok(flowsR, null))
  const opsUpdates     = ok(opsR, { updates: [] })?.updates ?? []
  const productsPoints = safePoints(ok(productsR, null))

  const sopCounts  = splitByStatus(sopsPoints)
  const faqCounts  = splitByStatus(faqsPoints)
  const flowCounts = splitByStatus(flowsArr)

  const products = productsPoints.slice(0, 8).map((p) => {
    const pl = p?.payload ?? {}
    const sh = pl.shopify ?? pl.structured?.shopify_admin ?? {}
    const firstImage = (...candidates) => candidates.flat(Infinity).find((image) => typeof image === 'string' && image.trim()) ?? null
    return {
      id: p.id,
      title: pl.title ?? pl.name ?? sh.title ?? 'Untitled product',
      imageUrl: firstImage(
        pl.featured_image?.url, pl.featured_image?.src, pl.featuredImage?.url, pl.featuredImage?.src,
        pl.image?.url, pl.image?.src, pl.images?.map((image) => image?.url ?? image?.src),
        sh.featuredImage?.url, sh.featuredImage?.src, sh.image?.url, sh.image?.src,
        sh.images?.map((image) => image?.url ?? image?.src),
        sh.images?.edges?.map((edge) => edge?.node?.url ?? edge?.node?.src),
      ),
      productUrl: pl.product_url ?? pl.url ?? sh.onlineStoreUrl ?? sh.productUrl ?? '',
      price: pl.price ?? '',
      coverage: pl.coverage ?? null, // [MOCK] coverage field not yet in API shape
      bestSellerScore: Number(pl.best_seller_score ?? pl.sales_rank ?? pl.sales ?? 0) || null,
      newestAt: pl.updated_at ?? pl.created_at ?? p.updated_at ?? p.created_at ?? null,
    }
  })

  const operations = opsUpdates.slice(0, 6).map((u, i) => ({
    id: u.id != null ? String(u.id) : `op-${i}`,
    title: u.message ?? u.title ?? u.content ?? 'Operational update',
    kind: u.kind ?? u.type ?? 'notice',
    expiresAt: u.expires_at ?? u.expiresAt ?? null,
    agentBehaviour: u.agent_behaviour ?? u.agentBehaviour ?? u.behaviour ?? '',
  }))

  // [MOCK] Heuristic step completion — replace when /api/setup is ready.
  const hasSource  = sopsPoints.length > 0 || faqsPoints.length > 0
  const hasReview  = sopCounts.published > 0 || faqCounts.published > 0
  const hasPublish = hasReview
  const hasAgent   = false // [MOCK] no agent-connection check yet

  const steps = SETUP_STEP_DEFS.map(({ key, label }) => ({
    key,
    label,
    done:
      key === 'source'  ? hasSource  :
      key === 'review'  ? hasReview  :
      key === 'publish' ? hasPublish :
      hasAgent,
  }))

  return {
    user: { firstName: deriveFirstName(user) },
    brand: {
      id: null,
      name: brandName,
      platform: 'other', // [MOCK] detect Shopify via getShopifyCredentialStatus later
    },
    counts: { sops: sopCounts, faqs: faqCounts, flows: flowCounts },
    products: products.length ? products : null,
    productError: productsR.status === 'rejected' ? productsR.reason : null,
    operations,
    setup: {
      steps,
      completedAt: steps.every((s) => s.done) ? new Date().toISOString() : null,
    },
    flags: {
      sourceCount: hasSource ? 1 : 0, // [MOCK] no source-list endpoint yet
      lastSyncedAt: null,              // [MOCK] not exposed by the API
      failedPages: 0,                  // [MOCK] not exposed by the API
    },
    blockStatus: {
      metrics: [sopsR, faqsR, flowsR].some((result) => result.status === 'rejected') ? 'error' : 'ready',
      products: productsR.status === 'rejected' ? 'error' : 'ready',
      operations: opsR.status === 'rejected' ? 'error' : 'ready',
    },
    blockErrors: {
      metrics: [sopsR, faqsR, flowsR].find((result) => result.status === 'rejected')?.reason || null,
      products: productsR.status === 'rejected' ? productsR.reason : null,
      operations: opsR.status === 'rejected' ? opsR.reason : null,
    },
  }
}

// ─── Mock / localStorage path ─────────────────────────────────────────────────

async function fetchViaMock(user) {
  await mockDelay(400) // [MOCK] simulated latency
  const data = await getOverviewData()

  const sopCounts = {
    published: data.sops.filter((s) => isPublishedStatus(s.status)).length,
    drafts:    data.sops.filter((s) => !isPublishedStatus(s.status) && !isApprovedStatus(s.status)).length,
    approved:  data.sops.filter((s) => isApprovedStatus(s.status)).length,
  }
  const faqCounts = {
    published: data.faqs.filter((f) => isPublishedStatus(f.status)).length,
    drafts:    data.faqs.filter((f) => !isPublishedStatus(f.status) && !isApprovedStatus(f.status)).length,
    approved:  data.faqs.filter((f) => isApprovedStatus(f.status)).length,
  }

  const hasSource  = data.sops.length > 0 || data.faqs.length > 0
  const hasReview  = sopCounts.published > 0 || faqCounts.published > 0

  const steps = SETUP_STEP_DEFS.map(({ key, label }) => ({
    key,
    label,
    done:
      key === 'source'  ? hasSource  :
      key === 'review'  ? hasReview  :
      key === 'publish' ? hasReview  :
      false,
  }))

  return {
    user: { firstName: deriveFirstName(user) },
    brand: { id: null, name: 'Your brand', platform: 'other' }, // [MOCK]
    counts: {
      sops: sopCounts,
      faqs: faqCounts,
      flows: { published: 0, drafts: 0, approved: 0 }, // [MOCK] no flows in localStorage
    },
    products: data.products.length
      ? data.products.map((p) => ({
          id: p.id,
          title: p.name,
          imageUrl: null,    // [MOCK]
          price: p.price,
          coverage: null,    // [MOCK]
        }))
      : null,
    productError: null,
    operations: [], // [MOCK] no operations in localStorage mock
    setup: { steps, completedAt: null },
    flags: {
      sourceCount: data.sources.length,
      lastSyncedAt: null, // [MOCK]
      failedPages: 0,     // [MOCK]
    },
    blockStatus: { metrics: 'ready', products: 'ready', operations: 'ready' },
    blockErrors: { metrics: null, products: null, operations: null },
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOverview() {
  const { user } = useAuth()

  const [state, setState] = useState({ data: null, loading: true, error: null })

  // activeBrandName() is read at call time (not in the closure) so event-driven
  // reloads always fetch the brand that is currently stored in localStorage.
  const load = useCallback(async () => {
    const brandName = activeBrandName()
    const loadingShell = {
      user: { firstName: deriveFirstName(user) },
      brand: { id: null, name: brandName || 'Your brand', platform: 'other' },
      counts: { sops: { published: 0, drafts: 0, approved: 0 }, faqs: { published: 0, drafts: 0, approved: 0 }, flows: { published: 0, drafts: 0, approved: 0 } },
      products: null,
      operations: [],
      setup: { steps: [], completedAt: null },
      flags: { sourceCount: 0, lastSyncedAt: null, failedPages: 0 },
      blockStatus: { metrics: 'loading', products: 'loading', operations: 'loading' },
      blockErrors: { metrics: null, products: null, operations: null },
    }
    setState((s) => ({ data: s.data ? { ...s.data, blockStatus: { metrics: 'loading', products: 'loading', operations: 'loading' }, blockErrors: { metrics: null, products: null, operations: null } } : loadingShell, loading: false, error: null }))
    try {
      const data =
        hasOrbApi && brandName
          ? await fetchViaApi(brandName, user)
          : await fetchViaMock(user)
      setState({ data, loading: false, error: null })
    } catch (err) {
      setState((s) => ({ data: s.data, loading: false, error: err }))
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Re-fetch whenever the active brand changes.
  useEffect(() => {
    window.addEventListener('orb:brand-changed', load)
    return () => window.removeEventListener('orb:brand-changed', load)
  }, [load])

  return { ...state, reload: load }
}

// ─── Dev mock states (DEV builds only) ───────────────────────────────────────
// Vite replaces import.meta.env.DEV with false in production so the entire
// object is dead code and tree-shaken from the production bundle.

export const MOCK_STATES = import.meta.env.DEV
  ? {
      /** Brand new — no sources, no content. Shows the Setup block (State A). */
      new: {
        user: { firstName: 'there' },
        brand: { id: null, name: 'THE DEARIST', platform: 'other' },
        counts: {
          sops:  { published: 0, drafts: 0 },
          faqs:  { published: 0, drafts: 0 },
          flows: { published: 0, drafts: 0 },
        },
        products: null,
        operations: [],
        setup: {
          steps: [
            { key: 'source',  label: 'Connect a knowledge source',   done: false },
            { key: 'review',  label: 'Review generated SOPs & FAQs', done: false },
            { key: 'publish', label: 'Publish approved knowledge',    done: false },
            { key: 'agent',   label: 'Connect your support agent',    done: false },
          ],
          completedAt: null,
        },
        flags: { sourceCount: 0, lastSyncedAt: null, failedPages: 0 },
      },

      /** Partial — has content, some drafts waiting, setup incomplete. */
      partial: {
        user: { firstName: 'Keith' },
        brand: { id: 'brand-1', name: 'THE DEARIST', platform: 'shopify' },
        counts: {
          sops:  { published: 4, drafts: 3, approved: 1 },
          faqs:  { published: 2, drafts: 5, approved: 0 },
          flows: { published: 1, drafts: 0, approved: 0 },
        },
        products: [
          { id: 'p1', title: 'Rose Lip Balm', imageUrl: null, price: '₹299', coverage: null },
          { id: 'p2', title: 'Velvet Serum',  imageUrl: null, price: '₹899', coverage: null },
          { id: 'p3', title: 'Glow Toner',    imageUrl: null, price: '₹449', coverage: null },
        ],
        operations: [
          {
            id: 'o1', title: 'Rose Lip Balm back in stock', kind: 'restock',
            expiresAt: null,
            agentBehaviour: 'Mention restock when asked about availability.',
          },
          {
            id: 'o2', title: 'Summer sale — 20% off', kind: 'offer',
            expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
            agentBehaviour: 'Apply discount code SUMMER20 at checkout.',
          },
          {
            id: 'o3', title: 'Courier capacity update', kind: 'notice',
            expiresAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
            agentBehaviour: 'Set delivery expectations for affected customers.',
          },
        ],
        setup: {
          steps: [
            { key: 'source',  label: 'Connect a knowledge source',   done: true  },
            { key: 'review',  label: 'Review generated SOPs & FAQs', done: true  },
            { key: 'publish', label: 'Publish approved knowledge',    done: false },
            { key: 'agent',   label: 'Connect your support agent',    done: false },
          ],
          completedAt: null,
        },
        flags: {
          sourceCount: 1,
          lastSyncedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
          failedPages: 0,
        },
      },

      /** Complete — all published, setup done, no drafts. */
      complete: {
        user: { firstName: 'Keith' },
        brand: { id: 'brand-1', name: 'THE DEARIST', platform: 'shopify' },
        counts: {
          sops:  { published: 12, drafts: 0, approved: 1 },
          faqs:  { published: 8,  drafts: 0, approved: 0 },
          flows: { published: 3,  drafts: 0, approved: 0 },
        },
        products: [
          { id: 'p1', title: 'Rose Lip Balm', imageUrl: null, price: '₹299', coverage: '94%' },
          { id: 'p2', title: 'Velvet Serum',  imageUrl: null, price: '₹899', coverage: '87%' },
          { id: 'p3', title: 'Glow Toner',    imageUrl: null, price: '₹449', coverage: '91%' },
          { id: 'p4', title: 'Hydra Mist',    imageUrl: null, price: '₹349', coverage: '78%' },
        ],
        operations: [
          {
            id: 'o1', title: 'Rose Lip Balm back in stock', kind: 'restock',
            expiresAt: null,
            agentBehaviour: 'Mention restock when asked about availability.',
          },
        ],
        setup: {
          steps: [
            { key: 'source',  label: 'Connect a knowledge source',   done: true },
            { key: 'review',  label: 'Review generated SOPs & FAQs', done: true },
            { key: 'publish', label: 'Publish approved knowledge',    done: true },
            { key: 'agent',   label: 'Connect your support agent',    done: true },
          ],
          completedAt: new Date().toISOString(),
        },
        flags: {
          sourceCount: 2,
          lastSyncedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          failedPages: 0,
        },
      },
      nonShopify: {
        user: { firstName: 'Keith' },
        brand: { id: 'brand-2', name: 'STUDIO NORTH', platform: 'other' },
        counts: { sops: { published: 3, drafts: 1, approved: 0 }, faqs: { published: 4, drafts: 0, approved: 0 }, flows: { published: 1, drafts: 0, approved: 0 } },
        products: [{ id: 'p1', title: 'Canvas Carryall', imageUrl: null, price: '$48', coverage: 'No FAQ yet' }],
        operations: [],
        setup: { steps: [], completedAt: null },
        flags: { sourceCount: 1, lastSyncedAt: null, failedPages: 0 },
      },
    }
  : null
