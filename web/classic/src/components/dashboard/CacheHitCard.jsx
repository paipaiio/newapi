/*
Copyright (C) 2025 QuantumNous

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

import React, { useEffect, useState } from 'react';
import { API } from '../../helpers';
import { useTranslation } from 'react-i18next';

// 缓存命中率卡片（迁移自旧 nginx 注入的 theme.js）。
// 每个用户只看自己的数字：后端从会话认出身份，绝不信任客户端传的 id。

const pct = (v) => (v == null ? '—' : (v >= 100 ? '100' : (+v).toFixed(2)) + '%');
const knum = (n) => {
  if (n == null) return '—';
  n = +n;
  return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : '' + n;
};

const Tile = ({ v, k }) => (
  <div style={{ minWidth: 88 }}>
    <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
    <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>{k}</div>
  </div>
);

export default function CacheHitCard() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [win, setWin] = useState('24h');

  useEffect(() => {
    API.get('/api/tt-status/api/usercache', { disableDuplicate: true, skipErrorHandler: true })
      .then((r) => {
        if (r.data && r.data.windows) setData(r.data);
      })
      .catch(() => {});
  }, []);

  if (!data) return null; // 无数据/未登录 → 不显示，保持看板整洁

  const winLabel = { '24h': t('24 小时'), '7d': t('7 天'), '30d': t('30 天') };
  const wins = ['24h', '7d', '30d'];
  const w = data.windows[win];

  return (
    <div className='mb-4'>
      <div
        style={{
          background: 'var(--semi-color-bg-2)',
          border: '1px solid var(--semi-color-border)',
          borderRadius: 16,
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{t('缓存命中率')}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {wins.map((x) => {
              const on = x === win;
              return (
                <button
                  key={x}
                  onClick={() => setWin(x)}
                  style={{
                    border: '1px solid var(--semi-color-border)',
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    lineHeight: 1,
                    background: on ? 'var(--semi-color-primary)' : 'transparent',
                    color: on ? '#fff' : 'var(--semi-color-text-1)',
                    borderColor: on ? 'var(--semi-color-primary)' : 'var(--semi-color-border)',
                  }}
                >
                  {winLabel[x]}
                </button>
              );
            })}
          </div>
        </div>
        {w && w.reqs ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {pct(w.cache_hit)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 3 }}>
                {t('命中缓存的输入 token 占总输入 token 的比例')}
              </div>
            </div>
            <Tile v={knum(w.cache_read)} k={t('命中输入 token')} />
            <Tile v={knum(w.cache_write)} k={t('写入缓存 token')} />
            <Tile v={knum(w.prompt_tokens)} k={t('总输入 token')} />
            <Tile v={knum(w.reqs)} k={t('请求数')} />
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--semi-color-text-2)', padding: '6px 0' }}>
            {t('该时间段暂无用量数据。')}
          </div>
        )}
      </div>
    </div>
  );
}
