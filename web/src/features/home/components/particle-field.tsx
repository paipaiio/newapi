/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

interface ParticleFieldProps {
  className?: string
}

// Brand indigo / teal as "r, g, b" triplets for rgba() composition.
const COLORS = ['99, 102, 241', '20, 184, 166'] as const

const FOV = 320
const DEPTH = 1200
const NEAR = 60
const LINK_DIST = 130
const SPEED = 0.9

interface Particle {
  x: number
  y: number
  z: number
  c: number
}

/**
 * Dependency-free 3D particle network rendered on a 2D canvas via perspective
 * projection: particles drift toward the camera (z decreases), nearby ones
 * are linked with hairlines, and the whole field gently follows the pointer.
 * Pauses when scrolled out of view; renders one static frame under
 * prefers-reduced-motion.
 */
export function ParticleField({ className }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let running = false
    let w = 0
    let h = 0

    const spawn = (randomZ: boolean): Particle => ({
      x: (Math.random() - 0.5) * 1600,
      y: (Math.random() - 0.5) * 1000,
      z: randomZ ? Math.random() * DEPTH + NEAR : DEPTH,
      c: Math.random() < 0.6 ? 0 : 1,
    })

    let points: Particle[] = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const target = Math.min(110, Math.max(36, Math.floor((w * h) / 16000)))
      points = Array.from({ length: target }, () => spawn(true))
    }

    // Pointer position relative to the canvas center, in [-0.5, 0.5].
    let mx = 0
    let my = 0
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      mx = (e.clientX - rect.left) / rect.width - 0.5
      my = (e.clientY - rect.top) / rect.height - 0.5
    }

    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2 + mx * 40
      const cy = h / 2 + my * 30

      const projected: { sx: number; sy: number; s: number; c: number }[] = []
      for (const p of points) {
        p.z -= SPEED
        if (p.z < NEAR) Object.assign(p, spawn(false))
        const s = FOV / p.z
        projected.push({ sx: cx + p.x * s, sy: cy + p.y * s, s, c: p.c })
      }

      // Hairline links between nearby projected points.
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i]
        for (let j = i + 1; j < projected.length; j++) {
          const b = projected[j]
          const dx = a.sx - b.sx
          const dy = a.sy - b.sy
          const d2 = dx * dx + dy * dy
          if (d2 < LINK_DIST * LINK_DIST) {
            const alpha =
              (1 - Math.sqrt(d2) / LINK_DIST) * 0.32 * Math.min(a.s, b.s)
            ctx.strokeStyle = `rgba(${COLORS[a.c]}, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.sx, a.sy)
            ctx.lineTo(b.sx, b.sy)
            ctx.stroke()
          }
        }
      }

      // Dots grow as they approach the camera.
      for (const q of projected) {
        const r = Math.min(2.6, 1.1 * q.s + 0.4)
        ctx.fillStyle = `rgba(${COLORS[q.c]}, ${Math.min(0.85, 0.22 + q.s * 0.4)})`
        ctx.beginPath()
        ctx.arc(q.sx, q.sy, r, 0, Math.PI * 2)
        ctx.fill()
      }

      if (running) raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (!running && !mq.matches) {
        running = true
        raf = requestAnimationFrame(frame)
      }
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove)

    // Only burn frames while the hero is on screen.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 }
    )
    io.observe(canvas)

    if (mq.matches) {
      frame() // single static render — no motion
    }

    return () => {
      stop()
      io.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70 dark:opacity-100',
        className
      )}
    />
  )
}
