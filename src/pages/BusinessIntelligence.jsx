import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lightbulb, PackageX, Plug, RefreshCw } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import { useBrand } from '../context/BrandContext'
import { getBusinessIntelligence } from '../services/businessIntelligence'
import { DEFAULT_RANGE } from '../services/aiAnalytics'
import DateRangeFilter from '../components/analytics/DateRangeFilter'
import useBrandAnalytics from '../hooks/useBrandAnalytics'
import { AnalyticsGate, NotAvailable, StatCard, num } from '../components/analytics/parts'

const TABS = [
  { id: 'insights', label: 'Business Insights' },
  { id: 'sales', label: 'Sales & Revenue' },
  { id: 'products', label: 'Product Insights' },
]

const norm = (value) => String(value || '').trim().toLowerCase()
const BADGE = {
  inventory: 'bg-red-50 text-danger border-red-200',
  demand: 'bg-amber-50 text-amber-800 border-amber-200',
  topic: 'bg-indigo-50 text-primary border-indigo-200',
  handoff: 'bg-sky-50 text-sky-700 border-sky-200',
  data: 'bg-slate-100 text-slate-600 border-slate-200',
}

// Find the catalog product a customer-mentioned product refers to.
const findInCatalog = (catalog, mention) =>
  catalog.find((product) => (product.handle && mention.handle && product.handle === mention.handle) || norm(product.name) === norm(mention.title))

// Every insight below is derived from real numbers. None is estimated.
function buildInsights(analytics, commerce) {
  const out = []
  const catalog = commerce?.products || []
  const asked = analytics.products || []

  const askedOutOfStock = asked.map((mention) => ({ mention, product: findInCatalog(catalog, mention) })).filter((entry) => entry.product?.isOutOfStock)
  if (askedOutOfStock.length) {
    const names = askedOutOfStock.slice(0, 3).map((entry) => `${entry.mention.title} (${entry.mention.conversations} ${entry.mention.conversations === 1 ? 'conversation' : 'conversations'})`).join(', ')
    out.push({ id: 'oos', type: 'inventory', badge: 'Needs attention', title: `${askedOutOfStock.length} ${askedOutOfStock.length === 1 ? 'product' : 'products'} customers asked about ${askedOutOfStock.length === 1 ? 'is' : 'are'} out of stock`, explanation: `Customers asked about ${names} in this period, but ${askedOutOfStock.length === 1 ? 'it is' : 'they are'} currently out of stock in your catalog.`, action: 'Restock, or give the AI an update with the expected date so it can answer customers.' })
  }

  const topTopic = analytics.topics.items[0]
  if (topTopic) {
    out.push({ id: 'topic', type: 'topic', badge: 'Customer demand', title: `“${topTopic.topic}” is the most common customer topic`, explanation: `${num(topTopic.conversations)} of ${num(analytics.topics.tagged_conversations)} topic-tagged conversations in this period were about it.`, action: 'Check that your FAQs and SOPs cover this topic well.' })
  }

  const topProduct = asked[0]
  if (topProduct) {
    out.push({ id: 'product', type: 'demand', badge: 'Product interest', title: `${topProduct.title} is the product customers mention most`, explanation: `It came up in ${num(topProduct.conversations)} ${topProduct.conversations === 1 ? 'conversation' : 'conversations'} in this period.`, action: 'Make sure its product details, FAQs and availability are up to date.' })
  }

  const s = analytics.summary
  if (s.escalated_conversations > 0) {
    out.push({ id: 'handoff', type: 'handoff', badge: 'Team handoffs', title: `${num(s.escalated_conversations)} ${s.escalated_conversations === 1 ? 'conversation was' : 'conversations were'} handed over to your team`, explanation: `That is ${s.escalation_rate}% of the ${num(s.active_conversations)} conversations that had customer messages in this period.`, action: 'Review these conversations for questions the AI should be able to answer.' })
  }

  const coverage = analytics.topics.coverage_pct
  if (analytics.topics.total_conversations > 0 && coverage != null && coverage < 50) {
    out.push({ id: 'coverage', type: 'data', badge: 'About this data', title: 'Topic and product insights are based on a partial view', explanation: `Only ${coverage}% of conversations started in this period have been tagged with topics and products, so the counts above may be low.`, action: 'No action needed. This improves as more conversations are tagged.' })
  }
  return out
}

export default function BusinessIntelligence({ defaultTab = 'insights' }) {
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') || defaultTab
  const [range, setRange] = useState(DEFAULT_RANGE)
  const { brand, brandId, brandName } = useBrand()
  const analytics = useBrandAnalytics(range)
  const usable = Boolean(brandId) && !brand?.isPlaceholder

  const [commerce, setCommerce] = useState(null)
  const [commerceLoading, setCommerceLoading] = useState(false)

  const loadCommerce = () => {
    if (!usable) return
    setCommerceLoading(true)
    getBusinessIntelligence(brandId, brandName)
      .then(setCommerce)
      .catch(() => setCommerce(null))
      .finally(() => setCommerceLoading(false))
  }
  useEffect(loadCommerce, [usable, brandId, brandName])

  const refresh = () => {
    analytics.reload()
    loadCommerce()
  }

  const insights = useMemo(() => (analytics.data ? buildInsights(analytics.data, commerce) : []), [analytics.data, commerce])

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Business Intelligence"
        title="Commerce & Customer Insights"
        description={`What ${brandName || 'your'} customers are asking about, from real conversations and your product catalog.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <Button variant="secondary" size="sm" onClick={refresh}>
              <RefreshCw size={14} className={analytics.status === 'loading' || commerceLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex border-b border-line">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setParams({ tab: tab.id })} className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:border-line-strong hover:text-ink'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'sales' ? (
        <div className="space-y-6">
          <NotAvailable title="Sales and revenue are not connected yet" reason="Orb does not receive your store's orders or revenue, so no sales figures are shown, and none are estimated.">
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Link to="/app/tools"><Button variant="secondary" size="sm"><Plug size={14} /> {commerce ? (commerce.connected ? 'Manage integrations' : 'Connect Shopify') : 'Integrations'}</Button></Link>
            </div>
          </NotAvailable>
          {commerce ? (
            <p className="text-center text-xs text-fg-muted">
              {commerce.connected ? `Shopify is connected${commerce.storeDomain ? ` (${commerce.storeDomain})` : ''} and ${num(commerce.catalogCount)} products are synced, but order data is not.` : 'Shopify is not connected.'}
            </p>
          ) : (
            !commerceLoading && <p className="text-center text-xs text-fg-muted">Your store connection could not be checked right now.</p>
          )}
        </div>
      ) : (
        <AnalyticsGate analytics={analytics} label="Loading business insights">
          {(data) => (
            <>
              {activeTab === 'insights' && (
                <div className="space-y-6">
                  {insights.length === 0 ? (
                    <NotAvailable title="No insights for this period" reason="There were no customer conversations with topics or products in this period, so there is nothing to report yet." />
                  ) : (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {insights.map((insight) => (
                        <div key={insight.id} className="flex flex-col justify-between rounded-card border border-line bg-surface p-6 shadow-card">
                          <div>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${BADGE[insight.type]}`}><Lightbulb size={12} /> {insight.badge}</span>
                            <h3 className="mt-3 text-base font-bold text-ink">{insight.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{insight.explanation}</p>
                          </div>
                          <div className="mt-5 rounded-xl border border-line bg-subtle/50 p-3.5">
                            <span className="block text-[11px] font-bold uppercase tracking-wider text-primary">Suggested action</span>
                            <p className="mt-1 text-xs font-medium text-ink">{insight.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'products' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard title="Catalog Size" value={commerce ? num(commerce.catalogCount) : '—'} sub={commerce?.connected ? 'Products synced from your store' : 'No store connected'} />
                    <StatCard title="Out of Stock" icon={PackageX} tone="bg-red-50 text-danger" value={commerce ? num(commerce.outOfStock.length) : '—'} sub="Products currently unavailable" />
                    <StatCard title="Products Customers Mention" value={num(data.products.length)} sub="In conversations in this period" />
                  </div>

                  <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                    <h3 className="text-base font-bold text-ink">Products Customers Ask About</h3>
                    <p className="text-xs text-fg-muted">Products mentioned in conversations that started in this period, most discussed first</p>
                    {data.products.length === 0 ? (
                      <p className="mt-4 text-sm text-fg-muted">No products were mentioned in tagged conversations in this period.</p>
                    ) : (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-line text-fg-muted">
                              <th className="pb-3 font-semibold">Product</th>
                              <th className="pb-3 font-semibold">Conversations</th>
                              <th className="pb-3 font-semibold">Stock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {data.products.map((item) => {
                              const match = commerce ? findInCatalog(commerce.products, item) : null
                              return (
                                <tr key={item.key} className="hover:bg-subtle/50">
                                  <td className="py-3">
                                    <span className="flex items-center gap-3">
                                      {item.image_url ? <img src={item.image_url} alt="" className="h-9 w-9 rounded-md border border-line object-cover" loading="lazy" /> : <span className="h-9 w-9 rounded-md bg-subtle" />}
                                      <span className="font-semibold text-ink">{item.title}</span>
                                    </span>
                                  </td>
                                  <td className="py-3 font-bold text-primary">{num(item.conversations)}</td>
                                  <td className="py-3">
                                    {match ? (
                                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${match.isOutOfStock ? 'bg-red-50 text-danger' : 'bg-emerald-50 text-success'}`}>{match.isOutOfStock ? 'Out of stock' : 'In stock'}</span>
                                    ) : (
                                      <span className="text-fg-muted">Not in catalog</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="mt-4 border-t border-line pt-3 text-[11px] text-fg-muted">Sales, units sold and conversion are not shown because orders are not connected to Orb.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </AnalyticsGate>
      )}
    </div>
  )
}
