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
export const STUDIO_ENDPOINTS = {
  GENERATIONS: '/pg/images/generations',
  EDITS: '/pg/images/edits',
  USER_MODELS: '/api/user/models',
  USER_GROUPS: '/api/user/self/groups',
} as const

export const DEFAULT_STUDIO_GROUP = 'default'
export const DEFAULT_STUDIO_MODEL = 'gpt-image-2'
export const DEFAULT_STUDIO_SIZE = '1024x1024'
export const DEFAULT_STUDIO_QUALITY = 'low'
export const STUDIO_HISTORY_LIMIT = 24
export const STUDIO_MAX_REFERENCES = 4
export const STUDIO_REQUEST_TIMEOUT_MS = 180_000

export const STUDIO_SIZES = [
  { value: '1024x1024', labelKey: 'Square 1024' },
  { value: '1024x1536', labelKey: 'Portrait 1024x1536' },
  { value: '1536x1024', labelKey: 'Landscape 1536x1024' },
] as const

export const STUDIO_QUALITIES = [
  { value: 'low', labelKey: 'Low' },
  { value: 'medium', labelKey: 'Medium' },
  { value: 'high', labelKey: 'High' },
  { value: 'auto', labelKey: 'Auto' },
] as const

export const IMAGE_MODEL_HINTS = [
  'gpt-image',
  'dall-e',
  'imagine-image',
  'imagen',
  'flux',
  'wan2.7-image',
] as const
