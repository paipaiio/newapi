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
import type { StatusWindow } from '../types'

/** Format a percentage (0-100). */
export function fp(p: number | null | undefined): string {
  if (p == null) return '—'
  return `${p >= 100 ? '100' : Number(p).toFixed(2)}%`
}

/** Format milliseconds. */
export function fms(v: number | null | undefined): string {
  return v == null ? '—' : `${v} ms`
}

/** Format a large count with k/M suffixes. */
export function fnum(n: number | null | undefined): string {
  if (n == null) return '—'
  const v = Number(n)
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return `${v}`
}

/** Format a USD amount. */
export function fusd(n: number | null | undefined): string {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`
}

/** Relative "time ago" from a unix seconds timestamp. */
export function ago(
  s: number,
  unit: { s: string; m: string; h: string }
): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - s)
  if (d < 60) return `${d}${unit.s}`
  if (d < 3600) return `${Math.floor(d / 60)}${unit.m}`
  return `${Math.floor(d / 3600)}${unit.h}`
}

/** Format a bar timestamp label for the given window. */
export function fmtBarTime(t: number, win: StatusWindow): string {
  const d = new Date(t * 1000)
  const z = (n: number) => (n < 10 ? '0' : '') + n
  if (win === '7d' || win === '30d') {
    return `${d.getMonth() + 1}/${d.getDate()} ${z(d.getHours())}:00`
  }
  return `${z(d.getHours())}:${z(d.getMinutes())}`
}
