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
import { STUDIO_HISTORY_LIMIT } from './constants'
import type { StudioRecord } from './types'

const DB_NAME = 'newapi-image-studio'
const STORE_NAME = 'records'

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listStudioRecords(): Promise<StudioRecord[]> {
  const db = await openStudioDb()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAll()
    request.onsuccess = () => {
      const records = (request.result as StudioRecord[]).sort(
        (a, b) => b.createdAt - a.createdAt
      )
      resolve(records)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveStudioRecord(record: StudioRecord): Promise<void> {
  const existing = await listStudioRecords()
  const db = await openStudioDb()
  await new Promise<void>((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    store.put(record)
    const overflow = existing.filter((item) => item.id !== record.id)
    for (const extra of overflow.slice(STUDIO_HISTORY_LIMIT - 1)) {
      store.delete(extra.id)
    }
    store.transaction.oncomplete = () => resolve()
    store.transaction.onerror = () => reject(store.transaction.error)
  })
}

export async function deleteStudioRecord(id: string): Promise<void> {
  const db = await openStudioDb()
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readwrite')
      .objectStore(STORE_NAME)
      .delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function clearStudioRecords(): Promise<void> {
  const db = await openStudioDb()
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readwrite')
      .objectStore(STORE_NAME)
      .clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
