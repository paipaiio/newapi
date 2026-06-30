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

import React, { useCallback, useEffect, useState } from 'react';
import { Button, DatePicker, Input, Modal, Spin, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../helpers';
import { MarkdownContent } from '../../components/common/markdown/MarkdownRenderer';

const { Text } = Typography;
const PAGE_SIZE = 20;

// 让 Markdown 在对话气泡里排版紧凑:去掉首尾段落外边距,代码块/表格不撑破气泡。
const SESSLOG_MD_CSS = `
.sesslog-md > .markdown-body, .sesslog-md { line-height: 1.6; }
.sesslog-md p { margin: 6px 0; }
.sesslog-md > *:first-child { margin-top: 0 !important; }
.sesslog-md > *:last-child { margin-bottom: 0 !important; }
.sesslog-md pre { margin: 8px 0 !important; max-width: 100%; }
.sesslog-md ul, .sesslog-md ol { margin: 6px 0 !important; }
.sesslog-md.user-message code { color: #fff; background: rgba(255,255,255,.18); }
`;
if (typeof document !== 'undefined' && !document.getElementById('sesslog-md-style')) {
  const el = document.createElement('style');
  el.id = 'sesslog-md-style';
  el.textContent = SESSLOG_MD_CSS;
  document.head.appendChild(el);
}

function fmt(unix) {
  if (!unix) return '-';
  return new Date(unix * 1000).toLocaleString('zh-CN', { hour12: false });
}
function fmtQuota(q) { return q ? (q / 500000).toFixed(6) : '0'; }
function fmtBytes(b) { return !b ? '0' : b < 1024 ? `${b}B` : `${(b / 1024).toFixed(1)}KB`; }

const INIT = { username: '', model_name: '', request_id: '', keyword: '', only_failed: false, only_media: false, start_timestamp: null, end_timestamp: null };

// ── 内容块类型 ────────────────────────────────────────────────────────────────
// real-user / real-assistant / thinking / tool-call / tool-result / system-reminder / system-prompt / error

function stringifyContent(c) {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  try { return JSON.stringify(c, null, 2); } catch { return String(c); }
}

// 识别"联网搜索"类工具,与普通工具调用分门别类显示
const WEB_SEARCH_TOOLS = /(web[_-]?search|web[_-]?fetch|brave[_-]?search|google[_-]?search|bing[_-]?search|tavily|serp(api)?|search[_-]?web|browse|fetch[_-]?url|url[_-]?fetch|http[_-]?request)/i;
function isWebSearchTool(name) { return WEB_SEARCH_TOOLS.test(name || ''); }
// 从工具输入里抽出"搜索词/URL"做标签预览
function searchQueryOf(input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.query ?? input.q ?? input.search_query ?? input.queries ?? input.url ?? input.input ?? input.text;
  if (v == null) return '';
  return typeof v === 'string' ? v : stringifyContent(v);
}

// 从一段文本里切出 <system-reminder>...</system-reminder> 注入块
function splitSystemReminders(text) {
  if (!text || text.indexOf('<system-reminder>') === -1) {
    return [{ kind: 'text', text }];
  }
  const out = [];
  const re = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const seg = text.slice(last, m.index).trim();
      if (seg) out.push({ kind: 'text', text: seg });
    }
    out.push({ kind: 'system-reminder', text: m[1].trim() });
    last = re.lastIndex;
  }
  if (last < text.length) {
    const seg = text.slice(last).trim();
    if (seg) out.push({ kind: 'text', text: seg });
  }
  return out;
}

// 把一条 message 的 content 解析成有序 block 列表
function parseMessageBlocks(role, content) {
  const blocks = [];
  const pushText = (txt, baseRole) => {
    for (const seg of splitSystemReminders(txt)) {
      if (seg.kind === 'system-reminder') {
        blocks.push({ kind: 'system-reminder', text: seg.text });
      } else if (seg.text) {
        blocks.push({ kind: baseRole === 'user' ? 'real-user' : 'real-assistant', text: seg.text });
      }
    }
  };

  if (typeof content === 'string') {
    if (role === 'system') blocks.push({ kind: 'system-note', text: content });
    else pushText(content, role);
    return blocks;
  }
  if (!Array.isArray(content)) {
    blocks.push({ kind: role === 'user' ? 'real-user' : 'real-assistant', text: stringifyContent(content) });
    return blocks;
  }

  for (const blk of content) {
    if (!blk || typeof blk !== 'object') continue;
    switch (blk.type) {
      case 'text':
        pushText(blk.text || '', role);
        break;
      case 'thinking':
        blocks.push({ kind: 'thinking', text: blk.thinking || blk.text || '' });
        break;
      case 'tool_use':
        blocks.push({
          kind: isWebSearchTool(blk.name) ? 'web-search' : 'tool-call',
          name: blk.name || 'tool', input: blk.input,
          query: searchQueryOf(blk.input),
        });
        break;
      case 'tool_result': {
        let txt = '';
        if (typeof blk.content === 'string') txt = blk.content;
        else if (Array.isArray(blk.content)) {
          txt = blk.content.filter(p => p && p.type === 'text').map(p => p.text).join('\n') || stringifyContent(blk.content);
        } else txt = stringifyContent(blk.content);
        blocks.push({ kind: 'tool-result', text: txt, isError: !!blk.is_error });
        break;
      }
      case 'image': {
        const src = blk.source || {};
        let dataUrl = null, r2Key = null;
        if (src.type === 'r2_ref') {
          r2Key = src.r2_key || null;     // 已单独存 R2,由 ImageBlock 异步加载
        } else if (src.type === 'base64' && src.data) {
          dataUrl = `data:${src.media_type || 'image/jpeg'};base64,${src.data}`;
        } else if (src.url) {
          dataUrl = src.url;
        }
        // 也处理 OpenAI image_url 格式(r2_ref 化后 url = '[r2_ref]')
        if (!dataUrl && !r2Key && blk.image_url) {
          const iu = blk.image_url;
          r2Key = iu.r2_key || null;
          if (!r2Key && iu.url && !iu.url.startsWith('[r2_ref]')) dataUrl = iu.url;
        }
        blocks.push({ kind: 'image-block', dataUrl, r2Key, mediaType: src.media_type || '' });
        break;
      }
      case 'document':
      case 'file': {
        const src = blk.source || {};
        const title = blk.title || blk.name || src.filename || (blk.type === 'file' ? '附件' : '文档');
        const mimeType = src.media_type || blk.media_type || '';
        const text = src.type === 'text' ? (src.data || src.text || '') : '';
        blocks.push({ kind: 'file-block', title, mimeType, text });
        break;
      }
      default:
        if (blk.text) pushText(blk.text, role);
    }
  }
  return blocks;
}

// 把整段会话解析成有序 block 列表(含 system 提示词、各轮消息、最终回复)
function parseConversation(requestObj, responseText, errorText) {
  const all = [];

  // 系统提示词(可能是 string 或 array)
  if (requestObj && requestObj.system) {
    let sysText = '';
    if (typeof requestObj.system === 'string') sysText = requestObj.system;
    else if (Array.isArray(requestObj.system)) {
      sysText = requestObj.system.filter(b => b && (b.type === 'text' || typeof b === 'string'))
        .map(b => typeof b === 'string' ? b : b.text).join('\n');
    }
    if (sysText) all.push({ kind: 'system-prompt', text: sysText });
  }

  const msgs = (requestObj && (requestObj.messages || requestObj.input)) || [];
  for (const m of msgs) {
    if (!m || !m.role) continue;
    all.push(...parseMessageBlocks(m.role, m.content));
  }

  // 最终助手回复
  if (responseText) {
    let assistantText = responseText;
    try {
      const parsed = JSON.parse(responseText);
      const c0 = parsed.choices?.[0];
      if (c0?.message?.content) assistantText = c0.message.content;
      else if (c0?.delta?.content) assistantText = c0.delta.content;
      else if (Array.isArray(parsed.content)) {
        assistantText = parsed.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      }
    } catch { /* stream/plain text */ }
    if (assistantText) {
      for (const seg of splitSystemReminders(assistantText)) {
        if (seg.kind === 'system-reminder') all.push({ kind: 'system-reminder', text: seg.text });
        else if (seg.text) all.push({ kind: 'real-assistant', text: seg.text, final: true });
      }
    }
  }
  if (errorText) all.push({ kind: 'error', text: errorText });
  return all;
}

// ── 高亮 ──────────────────────────────────────────────────────────────────────
function Hi({ text, kw }) {
  if (!kw || !text) return <>{text}</>;
  const re = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return <>{text.split(re).map((p, i) => re.test(p)
    ? <mark key={i} style={{ background: '#ffe066', padding: '0 2px', borderRadius: 2 }}>{p}</mark> : p)}</>;
}

// 对话气泡正文:默认按 Markdown 渲染(粗体/列表/表格/代码/标题等);
// 当处于关键词检索高亮时,退回纯文本高亮(react-markdown 会拆散文本节点,无法整体高亮)。
function BubbleBody({ text, kw, user }) {
  if (kw && text && new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
    return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><Hi text={text} kw={kw} /></div>;
  }
  return (
    <div className={user ? 'sesslog-md user-message' : 'sesslog-md'} style={{ fontSize: 13 }}>
      <MarkdownContent content={text || ''} className={user ? 'user-message' : undefined} />
    </div>
  );
}

// ── 可折叠块(thinking / tool / system-reminder / system-prompt)──────────────
function Collapsible({ icon, label, sub, color, bg, body, defaultOpen = false, kw }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ margin: '2px 0', alignSelf: 'stretch' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center',
          gap: 6, fontSize: 12, color: color || 'var(--semi-color-text-2)',
          background: bg || 'var(--semi-color-fill-0)', borderRadius: 6, padding: '3px 10px',
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▸</span>
        <span>{icon} {label}</span>
        {sub && <span style={{ opacity: .65 }}>· {sub}</span>}
      </div>
      {open && (
        <pre style={{
          margin: '4px 0 0', padding: '8px 12px', background: 'var(--semi-color-fill-1)',
          borderRadius: 6, fontSize: 11.5, lineHeight: 1.55, maxHeight: 280, overflow: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid var(--semi-color-border)',
        }}><Hi text={body} kw={kw} /></pre>
      )}
    </div>
  );
}

// 图片块单独成组件以合法使用 hooks
function ImageBlock({ block }) {
  const [open, setOpen] = React.useState(false);
  const [fetchedUrl, setFetchedUrl] = React.useState(null);
  const [fetching, setFetching] = React.useState(false);

  // r2_key: 图片已单独存 R2 (attachments/),需从 API 加载
  React.useEffect(() => {
    if (!block.r2Key || fetchedUrl) return;
    setFetching(true);
    API.get(`/api/session_log/attachment?key=${encodeURIComponent(block.r2Key)}`)
      .then(res => {
        if (res?.data?.success) {
          const { base64: b64, media_type } = res.data.data;
          setFetchedUrl(`data:${media_type || 'image/jpeg'};base64,${b64}`);
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [block.r2Key]);

  const src = fetchedUrl || block.dataUrl || block.url || null;
  if (!src && !fetching) return <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>🖼 图片(无预览数据)</div>;
  if (fetching) return <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>🖼 加载图片…</div>;
  return (
    <div style={{ alignSelf: 'flex-start' }}>
      <img src={src} alt='上传图片' onClick={() => setOpen(o => !o)}
        style={{ maxHeight: open ? 480 : 80, maxWidth: '100%', borderRadius: 6, cursor: 'pointer',
          display: 'block', border: '1px solid var(--semi-color-border)', objectFit: 'contain',
          background: 'var(--semi-color-fill-0)' }} title={open ? '点击折叠' : '点击展开'} />
      <div style={{ fontSize: 10, color: 'var(--semi-color-text-2)', marginTop: 2 }}>
        {block.mediaType || 'image'} · {open ? '点击折叠' : '点击展开'}
      </div>
    </div>
  );
}

// ── 渲染单个 block ────────────────────────────────────────────────────────────
function BlockView({ block, kw }) {
  switch (block.kind) {
    case 'real-user':
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            background: '#155EEF', color: '#fff', borderRadius: '16px 16px 4px 16px',
            padding: '8px 14px', maxWidth: '78%', wordBreak: 'break-word', overflowWrap: 'anywhere',
          }}><BubbleBody text={block.text} kw={kw} user /></div>
        </div>
      );
    case 'real-assistant':
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', background: block.final ? '#10b981' : '#e0e0e0',
            color: block.final ? '#fff' : '#555', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, flexShrink: 0,
          }}>AI</div>
          <div style={{
            background: 'var(--semi-color-fill-1)', borderRadius: '16px 16px 16px 4px',
            padding: '8px 14px', maxWidth: '78%', wordBreak: 'break-word', overflowWrap: 'anywhere',
          }}><BubbleBody text={block.text} kw={kw} /></div>
        </div>
      );
    case 'thinking':
      return <Collapsible icon='💭' label='思考过程' sub={`${block.text.length} 字`} body={block.text} kw={kw}
        color='#8b5cf6' bg='rgba(139,92,246,0.08)' />;
    case 'tool-call':
      return <Collapsible icon='🔧' label={`工具调用: ${block.name}`} body={stringifyContent(block.input)} kw={kw}
        color='#0891b2' bg='rgba(8,145,178,0.08)' />;
    case 'web-search':
      return <Collapsible icon='🌐' label={`联网搜索: ${block.name}`} sub={block.query ? (block.query.length > 48 ? block.query.slice(0, 48) + '…' : block.query) : null}
        body={stringifyContent(block.input)} kw={kw} color='#2563eb' bg='rgba(37,99,235,0.08)' />;
    case 'tool-result':
      return <Collapsible icon={block.isError ? '⚠️' : '📤'} label={block.isError ? '工具结果(错误)' : '工具结果'}
        sub={`${block.text.length} 字`} body={block.text} kw={kw}
        color={block.isError ? '#dc2626' : '#64748b'} bg={block.isError ? 'rgba(220,38,38,0.06)' : 'var(--semi-color-fill-0)'} />;
    case 'image-block':
      return <ImageBlock block={block} />;
    case 'file-block':
      return <Collapsible icon='📄' label={block.title || '文件'} sub={block.mimeType || undefined}
        body={block.text || `[${block.mimeType || '二进制文件'}]`} kw={kw}
        color='#059669' bg='rgba(5,150,105,0.07)' />;
    case 'system-reminder':
      return <Collapsible icon='📌' label='系统注入 (system-reminder)' sub='非用户输入' body={block.text} kw={kw}
        color='#b45309' bg='rgba(180,83,9,0.08)' />;
    case 'system-note':
      return <Collapsible icon='⚙️' label='系统消息' body={block.text} kw={kw}
        color='#64748b' bg='var(--semi-color-fill-0)' />;
    case 'system-prompt':
      return <Collapsible icon='📋' label='系统提示词 (System Prompt)' sub={`${block.text.length} 字`} body={block.text} kw={kw}
        color='#64748b' bg='var(--semi-color-fill-0)' />;
    case 'error':
      return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            background: 'rgba(220,38,38,0.08)', borderRadius: 8, padding: '6px 14px', fontSize: 12,
            color: '#dc2626', maxWidth: '90%', border: '1px solid rgba(220,38,38,0.2)',
          }}>❌ <Hi text={block.text} kw={kw} /></div>
        </div>
      );
    default:
      return null;
  }
}

// ── 详情弹窗(预设尺寸 + 手动拖拽调整大小)──────────────────────────────────
function presetSizes() {
  return {
    default: { w: 860, h: 600 },
    large: { w: 1100, h: 760 },
    full: { w: Math.max(600, window.innerWidth - 80), h: Math.max(360, window.innerHeight - 220) },
  };
}

function DetailModal({ id, visible, onClose, keyword }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [rawMode, setRawMode] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [dim, setDim] = useState({ w: 860, h: 600 });   // 当前窗口尺寸(可拖拽)
  const [preset, setPreset] = useState('default');        // 当前选中的预设(拖拽后清空)
  const [hideNoise, setHideNoise] = useState(false);      // 隐藏工具/思考/注入,只看对话

  useEffect(() => {
    if (!visible || !id) return;
    setRawMode(false); setMetaOpen(false); setData(null); setHideNoise(false);
    setDim({ w: 860, h: 600 }); setPreset('default');
    setLoading(true);
    API.get(`/api/session_log/${id}`)
      .then(res => {
        if (res?.data?.success) {
          const { meta, content } = res.data.data;
          let payload = {};
          try { payload = JSON.parse(content); } catch { payload = { raw: content }; }
          let requestObj = null;
          if (payload.request) {
            requestObj = typeof payload.request === 'object' ? payload.request
              : (() => { try { return JSON.parse(payload.request); } catch { return null; } })();
          }
          const blocks = parseConversation(requestObj, payload.response, payload.error);
          setData({ meta, blocks, rawContent: content, redacted: meta.redacted });
        } else showError(res?.data?.message || '加载失败');
      })
      .catch(() => showError('请求失败'))
      .finally(() => setLoading(false));
  }, [id, visible]);

  function applyPreset(s) { setDim(presetSizes()[s]); setPreset(s); }

  // 拖拽右下角手柄:宽度跟随光标(居中弹窗故 ×2),高度直接随光标变化。
  function startResize(e) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = dim.w, startH = dim.h;
    setPreset(null);
    const onMove = (ev) => {
      const w = Math.max(460, Math.min(window.innerWidth - 32, startW + (ev.clientX - startX) * 2));
      const h = Math.max(260, Math.min(window.innerHeight - 140, startH + (ev.clientY - startY)));
      setDim({ w, h });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const visibleBlocks = data ? (hideNoise
    ? data.blocks.filter(b => b.kind === 'real-user' || b.kind === 'real-assistant' || b.kind === 'error')
    : data.blocks) : [];

  const counts = data ? data.blocks.reduce((a, b) => { a[b.kind] = (a[b.kind] || 0) + 1; return a; }, {}) : {};

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>会话详情</span>
          {data && data.redacted && <Tag color='orange' size='small'>已脱敏</Tag>}
          {data && <>
            <Button size='small' theme='borderless' type='tertiary' onClick={() => setRawMode(m => !m)} style={{ fontSize: 11 }}>
              {rawMode ? '💬 对话视图' : '{ } 原始数据'}
            </Button>
            {!rawMode && (
              <Button size='small' theme='borderless' type='tertiary' onClick={() => setHideNoise(h => !h)} style={{ fontSize: 11 }}>
                {hideNoise ? '显示全部' : '只看对话'}
              </Button>
            )}
            <span style={{ display: 'inline-flex', gap: 2, marginLeft: 4 }}>
              {['default', 'large', 'full'].map(s => (
                <Button key={s} size='small' theme={preset === s ? 'solid' : 'borderless'} type='tertiary'
                  onClick={() => applyPreset(s)} style={{ fontSize: 11, padding: '2px 8px' }}>
                  {s === 'default' ? '标准' : s === 'large' ? '大' : '全屏'}
                </Button>
              ))}
            </span>
          </>}
        </div>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={dim.w}
      bodyStyle={{ padding: '12px 16px' }}
    >
      {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spin size='large' /></div>}
      {!loading && data && (
        rawMode ? (
          <pre style={{
            background: 'var(--semi-color-fill-1)', color: 'var(--semi-color-text-0)', padding: 12,
            borderRadius: 6, height: dim.h, overflow: 'auto', fontSize: 11, margin: 0,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{data.rawContent}</pre>
        ) : (
          <>
            {/* 元数据折叠 */}
            <div onClick={() => setMetaOpen(o => !o)} style={{
              cursor: 'pointer', fontSize: 11, color: 'var(--semi-color-text-2)', marginBottom: 8, userSelect: 'none',
            }}>
              {metaOpen ? '▾' : '▸'} {data.meta.model_name} · {fmt(data.meta.created_at)} · {data.meta.is_success ? '✅ 成功' : `❌ ${data.meta.status_code}`}
              {' · '}{data.meta.prompt_tokens}+{data.meta.completion_tokens} tok · ${fmtQuota(data.meta.quota)}
            </div>
            {metaOpen && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px 16px', marginBottom: 10,
                padding: 10, background: 'var(--semi-color-fill-0)', borderRadius: 6, fontSize: 12,
              }}>
                {[['用户', data.meta.username], ['分组', data.meta.group], ['IP', data.meta.ip || '-'],
                  ['流式', data.meta.is_stream ? '是' : '否'], ['耗时(s)', data.meta.use_time], ['正文', fmtBytes(data.meta.object_size)]
                ].map(([k, v]) => <div key={k}><Text type='tertiary' size='small'>{k}: </Text><Text size='small'>{String(v ?? '-')}</Text></div>)}
                {data.meta.request_id && <div style={{ gridColumn: '1/-1' }}>
                  <Text type='tertiary' size='small'>Request ID: </Text><Text size='small' copyable>{data.meta.request_id}</Text>
                </div>}
              </div>
            )}

            {/* 内容统计条 */}
            <div style={{ fontSize: 11, color: 'var(--semi-color-text-2)', marginBottom: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {counts['real-user'] ? <span>👤 用户 {counts['real-user']}</span> : null}
              {counts['real-assistant'] ? <span>🤖 回复 {counts['real-assistant']}</span> : null}
              {counts['web-search'] ? <span>🌐 联网搜索 {counts['web-search']}</span> : null}
              {counts['tool-call'] ? <span>🔧 工具调用 {counts['tool-call']}</span> : null}
              {counts['tool-result'] ? <span>📤 工具结果 {counts['tool-result']}</span> : null}
              {counts['thinking'] ? <span>💭 思考 {counts['thinking']}</span> : null}
              {counts['image-block'] ? <span>🖼 图片 {counts['image-block']}</span> : null}
              {counts['file-block'] ? <span>📄 文件 {counts['file-block']}</span> : null}
              {counts['system-reminder'] ? <span>📌 注入 {counts['system-reminder']}</span> : null}
            </div>

            {/* 聊天区 + 右下角拖拽手柄 */}
            <div style={{ position: 'relative' }}>
              <div style={{
                height: dim.h, overflowY: 'auto', padding: '12px 4px',
                display: 'flex', flexDirection: 'column', gap: 8,
                border: '1px solid var(--semi-color-border)', borderRadius: 8, background: 'var(--semi-color-bg-2)',
              }}>
                {visibleBlocks.length === 0
                  ? <div style={{ textAlign: 'center', color: 'var(--semi-color-text-2)', padding: 20, fontSize: 13 }}>无可显示内容</div>
                  : visibleBlocks.map((b, i) => <BlockView key={i} block={b} kw={keyword} />)}
              </div>
              {/* 拖拽手柄:同时调整窗口宽度与聊天区高度 */}
              <div
                onMouseDown={startResize}
                title='拖拽调整窗口大小'
                style={{
                  position: 'absolute', right: 2, bottom: 2, width: 18, height: 18, cursor: 'nwse-resize',
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                  color: 'var(--semi-color-text-2)', opacity: 0.6, userSelect: 'none', fontSize: 12, lineHeight: 1,
                }}
              >◢</div>
            </div>
          </>
        )
      )}
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function SessionLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(INIT);
  const [filters, setFilters] = useState(INIT);
  const [selected, setSelected] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const load = useCallback(async (p, f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ p, page_size: PAGE_SIZE });
      if (f.username) params.set('username', f.username);
      if (f.model_name) params.set('model_name', f.model_name);
      if (f.request_id) params.set('request_id', f.request_id);
      if (f.keyword) params.set('keyword', f.keyword);
      if (f.only_failed) params.set('only_failed', 'true');
      if (f.only_media) params.set('only_media', 'true');
      if (f.start_timestamp) params.set('start_timestamp', Math.floor(new Date(f.start_timestamp).getTime() / 1000));
      if (f.end_timestamp) params.set('end_timestamp', Math.floor(new Date(f.end_timestamp).getTime() / 1000));
      const res = await API.get(`/api/session_log/?${params}`);
      if (res?.data?.success) { setRows(res.data.data.items || []); setTotal(res.data.data.total || 0); }
    } catch { showError('加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1, INIT); }, []);

  const [backfilling, setBackfilling] = useState(false);
  const [cgOrganizing, setCgOrganizing] = useState(false);
  function onSearch() { setFilters(pending); setPage(1); load(1, pending); }
  function onReset() { setPending(INIT); setFilters(INIT); setPage(1); load(1, INIT); }
  function openDetail(id) { setSelected({ id, keyword: filters.keyword }); setModalVisible(true); }
  async function onOrganize() {
    setCgOrganizing(true);
    try {
      const date = cgPending.organize_date?.trim() || '';
      const res = await API.post(`/api/session_log/organize${date ? `?date=${date}` : ''}`);
      if (res?.data?.success) {
        showSuccess(res.data.message || '整理完成');
        loadGroups(1, cgFilters);
      } else showError(res?.data?.message || '整理失败');
    } catch { showError('请求失败'); }
    finally { setCgOrganizing(false); }
  }
  async function onBackfill() {
    setBackfilling(true);
    try {
      const res = await API.post('/api/session_log/backfill_content?limit=2000');
      if (res?.data?.success) {
        const d = res.data.data || {};
        showError(`回填完成:扫描 ${d.scanned}，写入 ${d.updated}，跳过 ${d.skipped}，失败 ${d.failed}`);
        load(page, filters);
      } else showError(res?.data?.message || '回填失败');
    } catch { showError('回填请求失败'); }
    finally { setBackfilling(false); }
  }

  // ── 会话记录脱敏全局开关(管理员)─────────────────────────────────────────────
  const [redactStored, setRedactStored] = useState(false);
  const [redactSaving, setRedactSaving] = useState(false);
  useEffect(() => {
    API.get('/api/option/').then(res => {
      if (res?.data?.success) {
        const item = (res.data.data || []).find(o => o.key === 'storage_setting.redact_stored');
        if (item) setRedactStored(item.value === 'true');
      }
    }).catch(() => {});
  }, []);
  async function toggleRedactStored() {
    const next = !redactStored;
    setRedactSaving(true);
    try {
      const res = await API.put('/api/option/', { key: 'storage_setting.redact_stored', value: String(next) });
      if (res?.data?.success) {
        setRedactStored(next);
        showSuccess(next ? '已开启会话记录脱敏(仅影响新记录)' : '已关闭会话记录脱敏');
      } else showError(res?.data?.message || '设置失败');
    } catch { showError('设置请求失败'); }
    finally { setRedactSaving(false); }
  }

  // ── 会话聚合视图 ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('requests');
  const [cgRows, setCgRows] = useState([]);
  const [cgTotal, setCgTotal] = useState(0);
  const [cgPage, setCgPage] = useState(1);
  const [cgLoading, setCgLoading] = useState(false);
  const [cgPending, setCgPending] = useState({ username: '', model_name: '', date_from: '', date_to: '' });
  const [cgFilters, setCgFilters] = useState({ username: '', model_name: '', date_from: '', date_to: '' });

  const loadGroups = useCallback(async (p, f) => {
    setCgLoading(true);
    try {
      const params = new URLSearchParams({ p, page_size: PAGE_SIZE });
      if (f.username) params.set('username', f.username);
      if (f.model_name) params.set('model_name', f.model_name);
      if (f.date_from) params.set('date_from', f.date_from);
      if (f.date_to) params.set('date_to', f.date_to);
      const res = await API.get(`/api/session_log/groups?${params}`);
      if (res?.data?.success) { setCgRows(res.data.data.items || []); setCgTotal(res.data.data.total || 0); }
    } catch { showError('加载失败'); }
    finally { setCgLoading(false); }
  }, []);

  function onTabChange(t) {
    setTab(t);
    if (t === 'conversations' && cgRows.length === 0) loadGroups(1, cgFilters);
  }
  function onCgSearch() { setCgFilters(cgPending); setCgPage(1); loadGroups(1, cgPending); }
  function onCgReset() { const z = { username: '', model_name: '', date_from: '', date_to: '' }; setCgPending(z); setCgFilters(z); setCgPage(1); loadGroups(1, z); }
  function openGroupDetail(cg) { setSelected({ id: cg.last_session_id, keyword: '' }); setModalVisible(true); }

  function fmtDuration(startedAt, endedAt) {
    const secs = endedAt - startedAt;
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}m${s}s`;
  }

  const cgColumns = [
    { title: '日期', dataIndex: 'date', width: 100 },
    { title: '用户', dataIndex: 'username', width: 110, ellipsis: true },
    { title: '模型', dataIndex: 'model_name', width: 160, ellipsis: true },
    { title: '轮次', dataIndex: 'turn_count', width: 60 },
    { title: 'Prompt', dataIndex: 'prompt_tokens', width: 80 },
    { title: 'Comp', dataIndex: 'comp_tokens', width: 80 },
    { title: '费用($)', width: 90, render: (_, r) => fmtQuota(r.prompt_tokens * 10 + r.comp_tokens * 30) },
    { title: '开始', dataIndex: 'started_at', width: 155, render: fmt },
    { title: '时长', width: 70, render: (_, r) => fmtDuration(r.started_at, r.ended_at) },
    { title: '操作', width: 70, fixed: 'right', render: (_, r) => (
      <Button size='small' theme='borderless' disabled={!r.last_session_id}
        onClick={() => openGroupDetail(r)}>详情</Button>
    )},
  ];

  const columns = [
    { title: '时间', dataIndex: 'created_at', width: 160, render: fmt },
    { title: '用户', dataIndex: 'username', width: 110, ellipsis: true },
    { title: '模型', dataIndex: 'model_name', width: 160, ellipsis: true },
    { title: '分组', dataIndex: 'group', width: 110, ellipsis: true },
    { title: '状态', width: 75, render: (_, r) => r.is_success ? <Tag color='green'>成功</Tag> : <Tag color='red'>{r.status_code || '失败'}</Tag> },
    { title: '流式', dataIndex: 'is_stream', width: 55, render: v => v ? '是' : '否' },
    { title: 'Prompt', dataIndex: 'prompt_tokens', width: 75 },
    { title: 'Comp', dataIndex: 'completion_tokens', width: 75 },
    { title: '费用($)', dataIndex: 'quota', width: 90, render: fmtQuota },
    { title: '操作', width: 70, fixed: 'right', render: (_, r) => <Button size='small' theme='borderless' onClick={() => openDetail(r.id)}>详情</Button> },
  ];

  return (
    <div className='mt-[60px] px-4'>
      {/* Tab 切换 */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 4 }}>
        {[['requests', '📋 请求记录'], ['conversations', '💬 会话聚合']].map(([t, label]) => (
          <Button key={t} size='small' theme={tab === t ? 'solid' : 'light'} type={tab === t ? 'primary' : 'tertiary'}
            onClick={() => onTabChange(t)}>{label}</Button>
        ))}
      </div>

      {tab === 'requests' ? (
        <>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Input size='small' placeholder='用户名' style={{ width: 130 }} value={pending.username} onChange={v => setPending(f => ({ ...f, username: v }))} />
            <Input size='small' placeholder='模型名' style={{ width: 160 }} value={pending.model_name} onChange={v => setPending(f => ({ ...f, model_name: v }))} />
            <Input size='small' placeholder='Request ID' style={{ width: 220 }} value={pending.request_id} onChange={v => setPending(f => ({ ...f, request_id: v }))} />
            <Input size='small' prefix='🔍' placeholder='搜索内容（全文检索）'
              style={{ width: 200, background: pending.keyword ? 'rgba(21,94,239,0.06)' : undefined }}
              value={pending.keyword} onChange={v => setPending(f => ({ ...f, keyword: v }))} />
            <DatePicker size='small' type='dateTime' placeholder='开始时间' style={{ width: 170 }} value={pending.start_timestamp} onChange={v => setPending(f => ({ ...f, start_timestamp: v }))} />
            <DatePicker size='small' type='dateTime' placeholder='结束时间' style={{ width: 170 }} value={pending.end_timestamp} onChange={v => setPending(f => ({ ...f, end_timestamp: v }))} />
            <Button size='small' theme={pending.only_failed ? 'solid' : 'light'} type={pending.only_failed ? 'danger' : 'tertiary'}
              onClick={() => setPending(f => ({ ...f, only_failed: !f.only_failed }))}>{pending.only_failed ? '仅失败 ✓' : '仅失败'}</Button>
            <Button size='small' theme={pending.only_media ? 'solid' : 'light'} type={pending.only_media ? 'primary' : 'tertiary'}
              onClick={() => setPending(f => ({ ...f, only_media: !f.only_media }))}>{pending.only_media ? '含附件 ✓' : '含附件'}</Button>
            <Button size='small' type='primary' onClick={onSearch}>查询</Button>
            <Button size='small' onClick={onReset}>重置</Button>
            <Button size='small' theme='light' type='tertiary' loading={backfilling} onClick={onBackfill}
              title='为旧记录补建全文检索索引(回源 R2 正文,仅需执行一次)'>回填检索</Button>
            <Button size='small' theme={redactStored ? 'solid' : 'light'} type={redactStored ? 'warning' : 'tertiary'}
              loading={redactSaving} onClick={toggleRedactStored}
              title='开启后新产生的会话记录存储前脱敏 PII/密钥,不影响旧记录'>
              {redactStored ? '记录脱敏 ✓' : '记录脱敏'}
            </Button>
            {filters.keyword && <Text size='small' style={{ color: '#155EEF' }}>🔍 {filters.keyword}</Text>}
          </div>
          <Table columns={columns} dataSource={rows} loading={loading} rowKey='id' scroll={{ x: 1100 }}
            pagination={{ total, pageSize: PAGE_SIZE, currentPage: page, onPageChange: p => { setPage(p); load(p, filters); }, showTotal: t => `共 ${t} 条`, showSizeChanger: false }} />
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Input size='small' placeholder='用户名' style={{ width: 130 }} value={cgPending.username} onChange={v => setCgPending(f => ({ ...f, username: v }))} />
            <Input size='small' placeholder='模型名' style={{ width: 160 }} value={cgPending.model_name} onChange={v => setCgPending(f => ({ ...f, model_name: v }))} />
            <Input size='small' placeholder='开始日期 YYYY-MM-DD' style={{ width: 170 }} value={cgPending.date_from} onChange={v => setCgPending(f => ({ ...f, date_from: v }))} />
            <Input size='small' placeholder='结束日期 YYYY-MM-DD' style={{ width: 170 }} value={cgPending.date_to} onChange={v => setCgPending(f => ({ ...f, date_to: v }))} />
            <Button size='small' type='primary' onClick={onCgSearch}>查询</Button>
            <Button size='small' onClick={onCgReset}>重置</Button>
            <Input size='small' placeholder='手动整理日期(默认昨天)' style={{ width: 200 }}
              value={cgPending.organize_date || ''} onChange={v => setCgPending(f => ({ ...f, organize_date: v }))} />
            <Button size='small' theme='light' type='warning' loading={cgOrganizing} onClick={onOrganize}
              title='手动触发指定日期的会话整理(默认昨天)'>🔄 手动整理</Button>
            <Text size='small' type='tertiary'>每天0:02自动整理，冗余R2已删除</Text>
          </div>
          <Table columns={cgColumns} dataSource={cgRows} loading={cgLoading} rowKey='id' scroll={{ x: 1000 }}
            pagination={{ total: cgTotal, pageSize: PAGE_SIZE, currentPage: cgPage, onPageChange: p => { setCgPage(p); loadGroups(p, cgFilters); }, showTotal: t => `共 ${t} 条会话`, showSizeChanger: false }} />
        </>
      )}

      <DetailModal id={selected?.id} visible={modalVisible} keyword={selected?.keyword || ''} onClose={() => setModalVisible(false)} />
    </div>
  );
}
