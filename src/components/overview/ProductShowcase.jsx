import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Skeleton from '../ui/Skeleton'

// The brand's own product imagery, floated on the right of the agent card. White product-shot
// backgrounds are removed in the browser so the bottles and boxes sit on the warm gradient.
// Which products appear: active products with an image, best sellers first when the store
// reports sales, otherwise newest first. Nothing is shown when there are none.
const hasReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useProductDrop(brandName, count) {
  const [drop, setDrop] = useState(false)
  useEffect(() => {
    setDrop(false)
    if (!count || hasReducedMotion()) return undefined
    const frame = window.requestAnimationFrame(() => setDrop(true))
    return () => window.cancelAnimationFrame(frame)
  }, [brandName, count])
  return drop
}

function removeWhiteImageCanvas(image) {
  const maxSize = 900
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return ''
  context.drawImage(image, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height)
  const { data } = pixels
  const total = width * height
  const seen = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  const isWhiteCanvas = (index) => {
    const offset = index * 4
    return data[offset + 3] > 12 && data[offset] > 240 && data[offset + 1] > 240 && data[offset + 2] > 240
  }
  const add = (index) => {
    if (seen[index] || !isWhiteCanvas(index)) return
    seen[index] = 1
    queue[tail++] = index
  }
  for (let x = 0; x < width; x += 1) {
    add(x)
    add((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(y * width)
    add(y * width + width - 1)
  }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    data[index * 4 + 3] = 0
    if (x) add(index - 1)
    if (x < width - 1) add(index + 1)
    if (y) add(index - width)
    if (y < height - 1) add(index + width)
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

function ProductImage({ product, onUnavailable, onReady, onClean }) {
  const [failed, setFailed] = useState(false)
  const [source, setSource] = useState(product.imageUrl)
  const [withoutCors, setWithoutCors] = useState(false)
  const processed = useRef(false)
  useEffect(() => {
    setFailed(false)
    setSource(product.imageUrl)
    setWithoutCors(false)
    processed.current = false
  }, [product.id, product.imageUrl])
  if (!product.imageUrl || failed) return null
  const cleanBackground = (event) => {
    onReady()
    if (processed.current) return
    processed.current = true
    try {
      const cleaned = removeWhiteImageCanvas(event.currentTarget)
      if (cleaned) {
        setSource(cleaned)
        onClean?.()
      }
    } catch {
      // A non-CORS image can still render normally; it simply keeps its source canvas.
    }
  }
  const handleImageError = () => {
    // Keep valid non-CORS product images visible. They cannot be processed by
    // canvas, but still fall back to the normal image instead of disappearing.
    if (!withoutCors) {
      setWithoutCors(true)
      return
    }
    setFailed(true)
    onUnavailable(product.id)
  }
  return <img key={`${source}:${withoutCors ? 'plain' : 'cors'}`} crossOrigin={withoutCors ? undefined : 'anonymous'} src={source} alt="" onLoad={cleanBackground} onError={handleImageError} className="aspect-square w-full object-contain" />
}

function ProductCard({ product, index, drop, onUnavailable }) {
  const [ready, setReady] = useState(false)
  const [clean, setClean] = useState(false)
  useEffect(() => { setReady(false); setClean(false) }, [product.id, product.imageUrl])
  const style = { '--product-tilt': `${[-3, -1, 1, 3][index % 4]}deg`, '--wave-y': `${[8, -6, 9, -2][index % 4]}px`, '--float-delay': `${index * -0.8}s`, animationDelay: `${index * 90}ms` }
  const className = `overview-product-card ${drop && ready ? 'overview-product-card--drop' : ''} ${clean ? '' : 'overview-product-card--raw'} relative`
  const content = <span className="overview-product-art"><ProductImage product={product} onUnavailable={onUnavailable} onReady={() => setReady(true)} onClean={() => setClean(true)} /></span>
  if (product.productUrl) return <a href={product.productUrl} target="_blank" rel="noreferrer" aria-label={`Open ${product.title || 'product'} on the store`} className={className} style={style}>{content}</a>
  return <Link to={`/app/products?product=${encodeURIComponent(product.id)}`} aria-label={`Open ${product.title || 'product'}`} className={className} style={style}>{content}</Link>
}

export default function ProductShowcase({ products, productError, loading, brandName }) {
  const [unavailableImageIds, setUnavailableImageIds] = useState([])
  const selected = useMemo(() => {
    const items = (products || []).filter((product) => {
      const isActive = String(product?.status || 'active').toLowerCase() === 'active'
      return isActive && product.imageUrl && !unavailableImageIds.includes(product.id)
    })
    const hasBestSellers = items.some((product) => product.bestSellerScore !== null && product.bestSellerScore !== undefined)
    return items.sort((a, b) => {
      if (hasBestSellers) return Number(b.bestSellerScore || 0) - Number(a.bestSellerScore || 0)
      return String(b.newestAt || '').localeCompare(String(a.newestAt || ''))
    }).slice(0, 4)
  }, [products, unavailableImageIds])
  const drop = useProductDrop(brandName, selected.length)
  const hideUnavailableProduct = (id) => setUnavailableImageIds((current) => (current.includes(id) ? current : [...current, id]))
  if (loading) return <section aria-label="Loading featured products" className="flex h-full items-center justify-center pb-5">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="overview-product-skeleton" />)}</section>
  if (productError) return null
  if (!selected.length) return null
  return <section aria-label="Featured products" className="flex h-full items-center justify-center pb-5">{selected.map((product, index) => <ProductCard key={product.id} product={product} index={index} drop={drop} onUnavailable={hideUnavailableProduct} />)}</section>
}
