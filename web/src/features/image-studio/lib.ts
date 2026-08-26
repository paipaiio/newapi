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
import { isAxiosError } from 'axios'

import { IMAGE_MODEL_HINTS } from './constants'
import type { StudioModelOption } from './types'

export function isStudioImageModel(name: string): boolean {
  const normalized = name.toLowerCase()
  return IMAGE_MODEL_HINTS.some((hint) => normalized.includes(hint))
}

export function filterStudioModels(
  models: StudioModelOption[]
): StudioModelOption[] {
  const filtered = models.filter((model) => isStudioImageModel(model.value))
  if (filtered.length > 0) {
    return filtered
  }
  return models
}

export function pickDefaultStudioModel(
  models: StudioModelOption[],
  preferred: string
): string {
  if (models.some((model) => model.value === preferred)) {
    return preferred
  }
  return models[0]?.value ?? preferred
}

export function studioSizeForModel(model: string, size: string): string {
  if (model.toLowerCase().includes('4k')) {
    return '1024x1024'
  }
  return size
}

export function getRelayErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (!isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback
  }
  const payload = error.response?.data
  if (payload && typeof payload === 'object') {
    const relayError = (payload as { error?: { message?: string } }).error
    if (relayError?.message) {
      return relayError.message
    }
    const message = (payload as { message?: string }).message
    if (message) {
      return message
    }
  }
  return error.message || fallback
}

export function extensionForMime(mimeType: string): string {
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  return 'png'
}

/** CSS `aspect-ratio` value for a "WxH" studio size, e.g. "1024 / 1536". */
export function aspectRatioForSize(size: string): string {
  const [w, h] = size.split('x').map(Number)
  if (!w || !h) return '1 / 1'
  return `${w} / ${h}`
}

export type StudioRelativeTime =
  | { key: 'Just now' }
  | { key: '{{count}} minutes ago'; count: number }
  | { key: '{{count}} hours ago'; count: number }
  | { key: '{{count}} days ago'; count: number }

/** Bucket a timestamp into a coarse relative-time translation key. */
export function relativeTimeParts(
  createdAt: number,
  now: number
): StudioRelativeTime {
  const minutes = Math.floor((now - createdAt) / 60_000)
  if (minutes < 1) return { key: 'Just now' }
  if (minutes < 60) return { key: '{{count}} minutes ago', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: '{{count}} hours ago', count: hours }
  return { key: '{{count}} days ago', count: Math.floor(hours / 24) }
}
