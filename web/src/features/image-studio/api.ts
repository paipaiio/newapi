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
import { api } from '@/lib/api'

import {
  STUDIO_ENDPOINTS,
  STUDIO_REQUEST_TIMEOUT_MS,
} from './constants'
import type { StudioGenerateInput, StudioGroupOption, StudioModelOption } from './types'

type ImageApiResponse = {
  data?: { b64_json?: string; url?: string }[]
  error?: { message?: string }
}

function decodeBase64Image(b64: string): { bytes: ArrayBuffer; mimeType: string } {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { bytes: bytes.buffer, mimeType: 'image/png' }
}

async function imageFromUrl(url: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to download generated image')
  }
  const blob = await response.blob()
  return {
    bytes: await blob.arrayBuffer(),
    mimeType: blob.type || 'image/png',
  }
}

async function firstGeneratedImage(
  payload: ImageApiResponse
): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const item = payload.data?.[0]
  if (!item) {
    throw new Error(payload.error?.message || 'No image returned')
  }
  if (item.b64_json) {
    return decodeBase64Image(item.b64_json)
  }
  if (item.url) {
    return imageFromUrl(item.url)
  }
  throw new Error('No image returned')
}

export async function getStudioModels(group: string): Promise<StudioModelOption[]> {
  const res = await api.get(STUDIO_ENDPOINTS.USER_MODELS, {
    params: { group },
  })
  const { data } = res
  if (!data.success || !Array.isArray(data.data)) {
    return []
  }
  return data.data.map((model: string) => ({
    label: model,
    value: model,
  }))
}

export async function getStudioGroups(): Promise<StudioGroupOption[]> {
  const res = await api.get(STUDIO_ENDPOINTS.USER_GROUPS)
  const { data } = res
  if (!data.success || !data.data) {
    return []
  }
  const groupData = data.data as Record<string, { desc: string; ratio: number }>
  return Object.entries(groupData).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info.ratio,
    desc: info.desc,
  }))
}

export async function generateStudioImage(
  input: StudioGenerateInput,
  signal?: AbortSignal
): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  if (input.references.length > 0) {
    const form = new FormData()
    form.append('model', input.model)
    form.append('prompt', input.prompt)
    form.append('group', input.group)
    form.append('size', input.size)
    form.append('quality', input.quality)
    for (const file of input.references) {
      form.append('image', file)
    }
    const res = await api.post(STUDIO_ENDPOINTS.EDITS, form, {
      signal,
      timeout: STUDIO_REQUEST_TIMEOUT_MS,
      skipErrorHandler: true,
    })
    return firstGeneratedImage(res.data as ImageApiResponse)
  }

  const res = await api.post(
    STUDIO_ENDPOINTS.GENERATIONS,
    {
      model: input.model,
      prompt: input.prompt,
      group: input.group,
      size: input.size,
      quality: input.quality,
      n: 1,
    },
    {
      signal,
      timeout: STUDIO_REQUEST_TIMEOUT_MS,
      skipErrorHandler: true,
    }
  )
  return firstGeneratedImage(res.data as ImageApiResponse)
}
