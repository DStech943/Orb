import React, { useLayoutEffect, useRef } from 'react'
import Matter from 'matter-js'
import { Camera, CircleDot, Cloud, Flame, Heart, Music, Package, Rocket, Sparkles, Star } from 'lucide-react'

const tileDefinitions = [
  { id: 0, Icon: Star, tone: 'bg-primary text-white' },
  { id: 1, Icon: Sparkles, tone: 'bg-orange text-ink' },
  { id: 2, Icon: Cloud, tone: 'bg-primary-tint text-ink' },
  { id: 3, Icon: Heart, tone: 'bg-white text-ink' },
  { id: 4, Icon: Rocket, tone: 'bg-primary-dark text-white' },
  { id: 5, Icon: Music, tone: 'bg-white text-ink' },
  { id: 6, Icon: Flame, tone: 'bg-orange text-ink' },
  { id: 7, Icon: Camera, tone: 'bg-primary-tint text-ink' },
  { id: 8, Icon: CircleDot, tone: 'bg-orange text-ink' },
  { id: 9, Icon: Package, tone: 'bg-primary-dark text-white' },
]

const MOBILE_TILES = tileDefinitions.filter(({ Icon }) => ![Cloud, Heart].includes(Icon))
const STEP = 1000 / 60

function hasFinePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px) and (pointer: fine)').matches
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function PhysicsTileStage({ status = 404, dark = false, fullBleed = false }) {
  const stageRef = useRef(null)
  const tileRefs = useRef([])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined

    const { Engine, World, Bodies, Body, Composite, Mouse, MouseConstraint, Events } = Matter
    const engine = Engine.create({ enableSleeping: true, gravity: { x: 0, y: 1.1, scale: 0.001 } })
    const world = engine.world
    const reducedMotion = prefersReducedMotion()
    const desktop = hasFinePointer() && !reducedMotion
    const tiles = window.matchMedia('(max-width: 767px)').matches ? MOBILE_TILES : tileDefinitions
    const bodies = []
    const walls = []
    const spawnTimers = []
    let frame = 0
    let observer
    let resizeObserver
    let mouseConstraint
    let started = false
    let dragging = false
    let size = { width: 1, height: 1, tileWidth: 1, tileHeight: 1 }

    const random = (index, min, max) => {
      const unit = ((index * 9301 + 49297) % 233280) / 233280
      return min + unit * (max - min)
    }

    const paint = () => {
      bodies.forEach((body) => {
        const tile = tileRefs.current[body.plugin.orbTileIndex]
        if (!tile) return
        const dimensions = body.plugin.orbDimensions
        tile.style.opacity = '1'
        tile.style.width = `${dimensions.width}px`
        tile.style.height = `${dimensions.height}px`
        tile.style.transform = `translate3d(${body.position.x - dimensions.width / 2}px, ${body.position.y - dimensions.height / 2}px, 0) rotate(${body.angle}rad)`
      })
    }

    const needsMotion = () => bodies.some((body) => !body.isSleeping)
    const stopFrame = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }
    const tick = () => {
      frame = 0
      if (document.hidden) return
      Engine.update(engine, STEP)
      paint()
      if (needsMotion() || dragging || bodies.length < tiles.length) frame = window.requestAnimationFrame(tick)
    }
    const startFrame = () => {
      if (!frame && !document.hidden) frame = window.requestAnimationFrame(tick)
    }

    const clearWalls = () => walls.splice(0).forEach((wall) => World.remove(world, wall))
    const buildWalls = (width, height) => {
      clearWalls()
      const thickness = 22
      walls.push(
        Bodies.rectangle(width / 2, height + thickness / 2, width + thickness * 2, thickness, { isStatic: true, friction: 0.6 }),
        Bodies.rectangle(-thickness / 2, height / 2, thickness, height * 2, { isStatic: true, friction: 0.6 }),
        Bodies.rectangle(width + thickness / 2, height / 2, thickness, height * 2, { isStatic: true, friction: 0.6 }),
      )
      World.add(world, walls)
    }

    const resize = () => {
      const rect = stage.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      const tileWidth = Math.max(52, Math.min(92, width * 0.12))
      const tileHeight = tileWidth * 1.27
      const previous = size
      size = { width, height, tileWidth, tileHeight }
      buildWalls(width, height)

      bodies.forEach((body) => {
        const old = body.plugin.orbDimensions
        const scaleX = tileWidth / old.width
        const scaleY = tileHeight / old.height
        Body.scale(body, scaleX, scaleY)
        body.plugin.orbDimensions = { width: tileWidth, height: tileHeight }
        Body.setPosition(body, {
          x: Math.min(width - tileWidth / 2, Math.max(tileWidth / 2, body.position.x * (width / previous.width))),
          y: Math.min(height - tileHeight / 2, Math.max(tileHeight / 2, body.position.y * (height / previous.height))),
        })
      })
      paint()
    }

    const spawn = (definition, dropIndex) => {
      const width = size.tileWidth
      const height = size.tileHeight
      const x = random(dropIndex + 3, width / 2 + 4, size.width - width / 2 - 4)
      const body = Bodies.rectangle(x, -height, width, height, {
        restitution: 0.3,
        friction: 0.4,
        frictionAir: 0.01,
        sleepThreshold: 50,
      })
      body.plugin.orbDimensions = { width, height }
      body.plugin.orbTileIndex = definition.id
      Body.setAngle(body, random(dropIndex + 11, -35, 35) * (Math.PI / 180))
      bodies.push(body)
      World.add(world, body)
      startFrame()
    }

    const startSequence = () => {
      if (started) return
      started = true
      tiles.forEach((definition, index) => {
        spawnTimers.push(window.setTimeout(() => spawn(definition, index), index * 180))
      })
      startFrame()
    }

    resize()
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stage)

    if (reducedMotion) {
      tiles.forEach((definition, index) => spawn(definition, index))
      for (let index = 0; index < 240; index += 1) Engine.update(engine, STEP)
      paint()
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          startSequence()
          observer?.disconnect()
        }
      }, { threshold: 0.15 })
      observer.observe(stage)
    }

    const onVisibility = () => {
      if (document.hidden) stopFrame()
      else if (started && (needsMotion() || dragging || bodies.length < tiles.length)) startFrame()
    }
    document.addEventListener('visibilitychange', onVisibility)

    if (desktop) {
      const mouse = Mouse.create(stage)
      mouse.element.removeEventListener('wheel', mouse.mousewheel)
      mouse.element.removeEventListener('DOMMouseScroll', mouse.mousewheel)
      mouseConstraint = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.2, render: { visible: false } },
      })
      World.add(world, mouseConstraint)
      Events.on(mouseConstraint, 'startdrag', () => {
        dragging = true
        stage.dataset.dragging = 'true'
        startFrame()
      })
      Events.on(mouseConstraint, 'enddrag', () => {
        dragging = false
        delete stage.dataset.dragging
        startFrame()
      })
    }

    return () => {
      stopFrame()
      observer?.disconnect()
      resizeObserver?.disconnect()
      spawnTimers.forEach((timer) => window.clearTimeout(timer))
      document.removeEventListener('visibilitychange', onVisibility)
      if (mouseConstraint) World.remove(world, mouseConstraint)
      Composite.clear(world, false, true)
      Engine.clear(engine)
    }
  }, [])

  const allTiles = tileDefinitions
  return <div ref={stageRef} aria-hidden="true" className={`physics-tile-stage w-full overflow-hidden touch-pan-y ${fullBleed ? 'absolute inset-0 h-full' : 'relative h-[240px] md:h-[320px]'} ${dark ? 'bg-ink' : ''}`}>
    <div className={`absolute inset-0 [background-size:14px_14px] ${dark ? 'opacity-25 [background-image:radial-gradient(#E6E9FE_1px,transparent_1px)]' : 'opacity-70 [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)]'}`} />
    <div className={`absolute left-1/2 z-20 -translate-x-1/2 text-center ${fullBleed ? 'top-[58%]' : 'top-4'} ${dark ? 'text-white' : 'text-primary'}`}>
      <p className={`text-[10px] font-extrabold uppercase tracking-[0.18em] ${dark ? 'text-primary-tint' : 'text-muted'}`}>Connection error</p>
      <p className="mt-0.5 text-6xl font-black leading-none tracking-[-0.08em]">{status || 404}</p>
    </div>
    {allTiles.map(({ Icon, tone }, index) => <div key={Icon.displayName || index} ref={(node) => { tileRefs.current[index] = node }} className={`physics-tile absolute left-0 top-0 z-10 rounded-xl border-2 border-ink/20 ${tone}`} style={{ opacity: 0 }}><Icon className="absolute bottom-3 left-3" size={22} strokeWidth={1.8} /></div>)}
    <div className={`pointer-events-none absolute inset-0 z-20 border-x-2 border-b-2 ${dark ? 'border-primary-tint/60' : 'border-ink/20'}`} />
  </div>
}
