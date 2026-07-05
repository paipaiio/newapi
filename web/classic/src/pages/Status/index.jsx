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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API } from '../../helpers';
import { useTranslation } from 'react-i18next';
import './status.css';

// 服务状态页（迁移自旧独立页 status.html + tt-monitor python 服务）。
// 数据走 new-api 内建端点 /api/tt-status/api/*，不再依赖 nginx 注入或独立进程。

const WINLABEL = { '90m': '90 分钟', '24h': '24 小时', '7d': '7 天', '30d': '30 天' };
const WINAGO = { '90m': '90 分钟前', '24h': '24 小时前', '7d': '7 天前', '30d': '30 天前' };
const STT = {
  operational: { c: 'ok', l: '运行正常' },
  degraded: { c: 'warn', l: '偏慢' },
  down: { c: 'down', l: '异常' },
  maintenance: { c: 'maint', l: '维护中' },
  nodata: { c: 'maint', l: '无数据' },
};
const ATYPE = {
  maintenance: { l: '维护', bg: 'var(--tt-warnbg)', c: 'var(--tt-warn)' },
  incident: { l: '故障', bg: 'var(--tt-downbg)', c: 'var(--tt-down)' },
  info: { l: '通知', bg: 'var(--tt-maintbg)', c: 'var(--tt-maint)' },
  resolved: { l: '已恢复', bg: 'var(--tt-okbg)', c: 'var(--tt-ok)' },
};

const fp = (p) => (p == null ? '—' : (p >= 100 ? '100' : (+p).toFixed(2)) + '%');
const fms = (v) => (v == null ? '—' : v + ' ms');
const fnum = (n) => {
  if (n == null) return '—';
  n = +n;
  return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : '' + n;
};
const fusd = (n) => (n == null ? '—' : '$' + (+n).toFixed(2));
const ago = (s) => {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - s);
  return d < 60 ? d + ' 秒前' : d < 3600 ? Math.floor(d / 60) + ' 分钟前' : Math.floor(d / 3600) + ' 小时前';
};
const fmtT = (t, win) => {
  const d = new Date(t * 1000);
  const z = (n) => (n < 10 ? '0' : '') + n;
  if (win === '7d' || win === '30d') return d.getMonth() + 1 + '/' + d.getDate() + ' ' + z(d.getHours()) + ':00';
  return z(d.getHours()) + ':' + z(d.getMinutes());
};

// 延迟折线 sparkline（SVG）
function Spark({ series }) {
  if (!series || series.length < 2) {
    return <div className='tt-spark-empty'>延迟历史正在累积，稍后查看。</div>;
  }
  const W = 780,
    H = 80,
    p = 6;
  const ms = series.map((s) => s.ms);
  let mx = Math.max(...ms),
    mn = Math.min(...ms);
  if (mx === mn) mx = mn + 1;
  const pts = series.map((s, i) => [
    p + ((W - 2 * p) * i) / (series.length - 1),
    p + (H - 2 * p) * (1 - (s.ms - mn) / (mx - mn)),
  ]);
  const d = 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L ');
  const area = d + ' L ' + pts[pts.length - 1][0].toFixed(1) + ' ' + H + ' L ' + pts[0][0].toFixed(1) + ' ' + H + ' Z';
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width='100%' height='80' preserveAspectRatio='none'>
        <defs>
          <linearGradient id='tt-lg' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='var(--tt-accent)' stopOpacity='.22' />
            <stop offset='1' stopColor='var(--tt-accent)' stopOpacity='0' />
          </linearGradient>
        </defs>
        <path d={area} fill='url(#tt-lg)' />
        <path d={d} fill='none' stroke='var(--tt-accent)' strokeWidth='2' strokeLinejoin='round' />
      </svg>
      <div className='tt-spark-legend'>
        <span>{mn} ms</span>
        <span>当前 {ms[ms.length - 1]} ms</span>
        <span>峰值 {mx} ms</span>
      </div>
    </>
  );
}

// 公开流量指标 tiles（缓存命中/成功率/TTFT），无值时整块隐藏
function MetricsRow({ m, big }) {
  if (!m) return null;
  const tiles = [];
  if (m.cache_hit != null) tiles.push(['缓存命中 · 24h', fp(m.cache_hit)]);
  if (m.success != null) tiles.push(['成功率 · 24h', fp(m.success)]);
  if (m.ttft_p50 != null) tiles.push(['首字延迟 P50 · 1h', fms(m.ttft_p50)]);
  if (m.ttft_p95 != null) tiles.push(['首字延迟 P95 · 1h', fms(m.ttft_p95)]);
  if (!tiles.length) return null;
  return (
    <div className={'tt-metrics' + (big ? '' : ' sub')}>
      {tiles.map((t, i) => (
        <div className='tt-metric' key={i}>
          <div className='v'>{t[1]}</div>
          <div className='k'>{t[0]}</div>
        </div>
      ))}
    </div>
  );
}

// uptime bars
function Bars({ arr, win }) {
  return (
    <div className='tt-bars'>
      {(arr || []).map((x, i) => {
        const c =
          x.status === 'operational' ? 'ok' : x.status === 'degraded' ? 'warn' : x.status === 'down' ? 'down' : '';
        const tip =
          fmtT(x.t, win) + (x.pct == null ? ' · 无数据' : ' · ' + x.pct + '% 可用' + (x.ms != null ? ' · ' + x.ms + 'ms' : ''));
        return <i className={c} title={tip} key={i} />;
      })}
    </div>
  );
}

// 单个组件卡片
function ComponentCard({ c, win }) {
  const s = STT[c.status] || STT.nodata;
  const up = c.uptime && c.uptime[win];
  const upTxt = up == null ? '数据累积中…' : (WINLABEL[win] || '') + '可用率 ' + fp(up);
  const u = c.uptime || {};
  return (
    <div className='tt-card'>
      <div className='tt-ch'>
        <div>
          <div className='tt-name'>{c.name}</div>
          <div className='tt-desc'>{c.desc || ''}</div>
        </div>
        <span className={'tt-pill p-' + s.c}>
          <span className='tt-pd' />
          {s.l}
        </span>
      </div>
      {c.key === 'gateway' && (
        <>
          <div className='tt-metrics'>
            <div className='tt-metric'>
              <div className='v'>{c.latency_ms != null ? c.latency_ms + ' ms' : '—'}</div>
              <div className='k'>响应时间</div>
            </div>
            <div className='tt-metric'>
              <div className='v'>{fp(u['90m'])}</div>
              <div className='k'>90 分钟</div>
            </div>
            <div className='tt-metric'>
              <div className='v'>{fp(u['24h'])}</div>
              <div className='k'>24 小时</div>
            </div>
            <div className='tt-metric'>
              <div className='v'>{fp(u['7d'])}</div>
              <div className='k'>7 天</div>
            </div>
            <div className='tt-metric'>
              <div className='v'>{fp(u['30d'])}</div>
              <div className='k'>30 天</div>
            </div>
          </div>
          <MetricsRow m={c.metrics} big />
        </>
      )}
      <Bars arr={c.bars && c.bars[win]} win={win} />
      <div className='tt-meta'>
        <span>{WINAGO[win] || ''}</span>
        <span className='up'>
          {upTxt}
          {c.latency_ms != null ? ' · 延迟 ' + c.latency_ms + ' ms' : ''}
        </span>
        <span>现在</span>
      </div>
      {c.key !== 'gateway' && <MetricsRow m={c.metrics} />}
      {c.latency_60m && c.latency_60m.length > 0 && (
        <div className='tt-chart'>
          <h3>响应时间 · 最近一小时</h3>
          <Spark series={c.latency_60m} />
        </div>
      )}
    </div>
  );
}

// 管理面板（仅管理员）：分组监控开关/检测模型/展示名 + 流量指标表 + 添加公告
function ManagePanel({ onAnnotations, onExit }) {
  const [groups, setGroups] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [mWin, setMWin] = useState('24h');
  const [aType, setAType] = useState('info');
  const [aTitle, setATitle] = useState('');
  const [aDate, setADate] = useState('');
  const [aBody, setABody] = useState('');

  const api = (path, method, body) =>
    (method === 'POST'
      ? API.post('/api/tt-status/api/' + path, body, { skipErrorHandler: true })
      : API.get('/api/tt-status/api/' + path, { disableDuplicate: true, skipErrorHandler: true })
    ).then((r) => r.data);

  const loadGroups = () => api('groups').then((d) => setGroups((d && d.groups) || [])).catch(() => setGroups([]));
  const loadMetrics = () => api('metrics').then((d) => setMetrics(d && d.windows ? d : null)).catch(() => setMetrics(null));

  useEffect(() => {
    loadGroups();
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveGroup = (key, patch) => {
    const g = {};
    g[key] = patch;
    api('config', 'POST', { config: { groups: g } }).then(() => loadGroups());
  };
  const addAnn = () => {
    if (!aTitle.trim()) return;
    api('annotation', 'POST', { type: aType, title: aTitle.trim(), date: aDate.trim(), body: aBody.trim() }).then((r) => {
      if (r && r.annotations) {
        onAnnotations(r.annotations);
        setATitle('');
        setABody('');
      }
    });
  };

  const w = metrics && metrics.windows && metrics.windows[mWin];
  const rows = w ? Object.keys(w.groups || {}).sort() : [];
  const mrow = (name, m, cls) => (
    <tr className={cls} key={name}>
      <td>{name}</td>
      <td>{fnum(m.reqs)}</td>
      <td>{m.rpm != null ? m.rpm : '—'}</td>
      <td>{fnum(m.tokens)}</td>
      <td>{m.tpm != null ? m.tpm : '—'}</td>
      <td>{fp(m.cache_hit)}</td>
      <td>{fp(m.success)}</td>
      <td>{fusd(m.spend_usd)}</td>
    </tr>
  );

  return (
    <div className='tt-mgmt'>
      <h3>管理 · 分组检测与公告</h3>
      <h4>分组监控（开关 + 检测模型，立即保存）</h4>
      {!groups ? (
        <div className='tt-hint'>加载分组…</div>
      ) : (
        groups.map((g) => (
          <div className='tt-grow' key={g.key}>
            <span className='gn' title='原始分组名（仅管理员可见）'>
              {g.key}
            </span>
            <input
              className='gd'
              defaultValue={g.display || ''}
              placeholder='公开展示名'
              title='公开状态页显示的名称，留空恢复默认'
              onBlur={(e) => saveGroup(g.key, { display: e.target.value })}
            />
            <label>
              <input type='checkbox' defaultChecked={g.enabled} onChange={(e) => saveGroup(g.key, { enabled: e.target.checked })} /> 监控
            </label>
            <select defaultValue={g.model} onChange={(e) => saveGroup(g.key, { model: e.target.value })}>
              {(g.models || []).map((m) => (
                <option value={m} key={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        ))
      )}
      <h4>
        流量指标 · 仅管理员可见
        <select value={mWin} onChange={(e) => setMWin(e.target.value)} style={{ marginLeft: 8 }}>
          <option value='24h'>24 小时</option>
          <option value='1h'>1 小时</option>
        </select>
      </h4>
      {!metrics ? (
        <div className='tt-hint'>暂无流量数据（日志聚合每 5 分钟刷新一次）。</div>
      ) : !w ? (
        <div className='tt-hint'>该窗口暂无数据。</div>
      ) : (
        <>
          <table className='tt-mtbl'>
            <thead>
              <tr>
                <th>分组</th>
                <th>请求</th>
                <th>RPM</th>
                <th>Tokens</th>
                <th>TPM</th>
                <th>缓存命中</th>
                <th>成功率</th>
                <th>花费</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => mrow(g, w.groups[g], ''))}
              {mrow('合计', w.overall, 'tot')}
            </tbody>
          </table>
          <div className='tt-hint'>缓存命中 = 命中缓存的输入 token / 总输入 token；花费按 500000 额度 = $1 折算。</div>
        </>
      )}
      <h4>添加公告</h4>
      <div className='tt-row'>
        <select value={aType} onChange={(e) => setAType(e.target.value)}>
          <option value='info'>通知</option>
          <option value='maintenance'>维护</option>
          <option value='incident'>故障</option>
          <option value='resolved'>已恢复</option>
        </select>
        <input className='title' value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder='标题（必填）' />
        <input value={aDate} onChange={(e) => setADate(e.target.value)} placeholder='日期 (YYYY-MM-DD，可留空)' />
      </div>
      <div className='tt-row'>
        <textarea value={aBody} onChange={(e) => setABody(e.target.value)} placeholder='详情（可选）' />
      </div>
      <div className='tt-row'>
        <button className='tt-btn tt-btn-primary' onClick={addAnn}>
          发布公告
        </button>
        <button className='tt-btn' onClick={onExit}>
          退出管理
        </button>
      </div>
      <div className='tt-hint'>
        左起：原始分组名（仅你可见）· 公开展示名（可改，留空恢复默认）· 监控开关 · 检测模型。检测方式：调用 /v1/models 验证该分组是否提供所选模型（不消耗额度）。状态翻转会自动记录为事件。
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState({ config: {}, annotations: [] });
  const [win, setWin] = useState('90m');
  const [isAdmin, setIsAdmin] = useState(false);
  const [manage, setManage] = useState(false);
  const esRef = useRef(null);

  const loadStatus = () =>
    API.get('/api/tt-status/api/status', { disableDuplicate: true, skipErrorHandler: true })
      .then((r) => setStatus(r.data))
      .catch(() => {});
  const loadMeta = () =>
    API.get('/api/tt-status/api/meta', { disableDuplicate: true, skipErrorHandler: true })
      .then((r) => r.data && setMeta(r.data))
      .catch(() => {});

  useEffect(() => {
    loadStatus();
    loadMeta();
    API.get('/api/tt-status/api/whoami', { disableDuplicate: true, skipErrorHandler: true })
      .then((r) => setIsAdmin(!!(r.data && r.data.admin)))
      .catch(() => setIsAdmin(false));

    // SSE 实时推送
    let es;
    if (window.EventSource) {
      try {
        es = new EventSource('/api/tt-status/api/events');
        es.onmessage = (e) => {
          try {
            setStatus(JSON.parse(e.data));
          } catch (err) {}
        };
        es.onerror = () => {};
        esRef.current = es;
      } catch (e) {}
    }
    const metaTimer = setInterval(loadMeta, 120000);
    const stTimer = setInterval(() => {
      setStatus((s) => {
        if (!s || Math.floor(Date.now() / 1000) - (s.updated || 0) > 90) loadStatus();
        return s;
      });
    }, 90000);
    return () => {
      if (es) es.close();
      clearInterval(metaTimer);
      clearInterval(stTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall = status ? STT[status.overall] || STT.nodata : STT.nodata;
  const bannerCls = 'tt-banner b-' + (overall.c === 'maint' ? 'warn' : overall.c);
  const bannerTitle = !status
    ? '加载中…'
    : status.overall === 'operational'
      ? '所有系统运行正常'
      : status.overall === 'down'
        ? '部分服务异常'
        : '部分服务偏慢';
  const bannerSub = !status
    ? '正在获取当前状态…'
    : status.overall === 'operational'
      ? '网关与各分组线路均运行正常。'
      : '部分分组存在异常或偏慢，详见下方。';

  const wins = (status && status.windows) || ['90m', '24h', '7d', '30d'];
  const comps = (status && status.components) || [];
  const annotations = meta.annotations || [];

  const delAnn = (id) => {
    if (!window.confirm('删除该公告？')) return;
    API.post('/api/tt-status/api/annotation/delete', { id }, { skipErrorHandler: true }).then((r) => {
      if (r.data && r.data.annotations) setMeta((m) => ({ ...m, annotations: r.data.annotations }));
    });
  };

  // 按 category 分组渲染
  const grouped = [];
  let lastCat = null;
  comps.forEach((c) => {
    const cat = c.category || (c.key === 'gateway' ? '网关' : '线路');
    if (cat !== lastCat) {
      grouped.push({ cat });
      lastCat = cat;
    }
    grouped.push({ comp: c });
  });

  return (
    <div className='tt-status-wrap'>
      <div className='tt-top'>
        <div>
          <div className='tt-brand'>{meta.config?.title || t('服务状态')}</div>
          <div className='tt-sub'>{meta.config?.subtitle || t('服务可用性实时监控')}</div>
        </div>
        {isAdmin && (
          <div className='tt-right'>
            <button
              className='tt-btn'
              onClick={() => setManage((m) => !m)}
            >
              {manage ? '关闭管理' : '管理'}
            </button>
          </div>
        )}
      </div>

      {manage && isAdmin && (
        <ManagePanel
          onAnnotations={(anns) => setMeta((m) => ({ ...m, annotations: anns }))}
          onExit={() => setManage(false)}
        />
      )}

      <div className={bannerCls}>
        <div className='tt-dot' />
        <div>
          <h1>{bannerTitle}</h1>
          <p>{bannerSub}</p>
        </div>
      </div>

      <div className='tt-winbar'>
        <span className='lbl'>服务可用度</span>
        {wins.map((w) => (
          <button className={'tt-tab' + (w === win ? ' on' : '')} key={w} onClick={() => setWin(w)}>
            {WINLABEL[w] || w}
          </button>
        ))}
      </div>

      <div>
        {grouped.length === 0 && <div className='tt-empty'>未监控任何分组。</div>}
        {grouped.map((g, i) =>
          g.cat ? (
            <div className='tt-grp' key={'cat' + i}>
              {g.cat}
            </div>
          ) : (
            <ComponentCard c={g.comp} win={win} key={g.comp.key} />
          ),
        )}
      </div>

      <div className='tt-sec'>公告与事件</div>
      <div>
        {annotations.length === 0 ? (
          <div className='tt-empty'>暂无公告或事件记录。</div>
        ) : (
          annotations.map((a) => {
            const ty = ATYPE[a.type] || ATYPE.info;
            return (
              <div className='tt-ann' key={a.id}>
                <div className='h'>
                  <span className='badge' style={{ background: ty.bg, color: ty.c }}>
                    {ty.l}
                  </span>
                  <span className='t'>{a.title}</span>
                  <span className='d'>{a.date || ''}</span>
                </div>
                {a.body && <div className='b'>{a.body}</div>}
                {manage && isAdmin && (
                  <button className='del' onClick={() => delAnn(a.id)}>
                    删除
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className='tt-foot'>
        TUFTech AI 网关 · 状态实时更新
        <br />
        最后更新 {status && status.updated ? ago(status.updated) : '—'}
      </div>
    </div>
  );
}

// For commercial licensing, please contact support@quantumnous.com
