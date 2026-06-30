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

import React, { useState, useEffect } from 'react';
import {
  Button, Card, DatePicker, Select, Space, Spin, Table, Tag, Typography,
} from '@douyinfe/semi-ui';
import { IconBarChartVStroked, IconRefresh } from '@douyinfe/semi-icons';
import { VChart } from '@visactor/react-vchart';
import { API, showError } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const QUOTA_PER_UNIT = 500000;
const fmt = (n) => (n == null ? '-' : `$${n.toFixed(4)}`);
const fmtPct = (n) => (n == null ? '-' : `${n.toFixed(1)}%`);

const PRESETS = [
  { label: '今天', days: 0 },
  { label: '7天', days: 7 },
  { label: '30天', days: 30 },
];

function getRange(days) {
  const now = Math.floor(Date.now() / 1000);
  const start = days === 0
    ? Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
    : now - days * 86400;
  return { start, end: now };
}

export default function ChannelCostPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState(7);
  const [customRange, setCustomRange] = useState(null);
  const [trend, setTrend] = useState([]);

  const load = async () => {
    const { start, end } = customRange ?? getRange(preset);
    setLoading(true);
    try {
      const res = await API.get(`/api/log/channel_cost?start=${start}&end=${end}`);
      if (res?.data?.success) {
        setRows(res.data.data || []);
      } else {
        showError(res?.data?.message || t('加载失败'));
      }
      // 同时加载每日利润趋势
      const tr = await API.get(`/api/log/profit_report?start=${start}&end=${end}`);
      if (tr?.data?.success) {
        setTrend(tr.data.data || []);
      }
    } catch { showError(t('请求失败')); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [preset, customRange]);

  const totRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  const totCost    = rows.reduce((s, r) => s + (r.cost || 0), 0);
  const totProfit  = totRevenue - totCost;
  const totMargin  = totRevenue > 0 ? (totProfit / totRevenue * 100) : 0;

  const chartSpec = {
    type: 'bar',
    data: [{ id: 'cost_data', values: rows.flatMap(r => [
      { channel: r.channel_name || `#${r.channel_id}`, type: '收入', value: r.revenue || 0 },
      { channel: r.channel_name || `#${r.channel_id}`, type: '成本', value: r.cost || 0 },
    ]) }],
    xField: 'channel', yField: 'value', seriesField: 'type',
    legends: { visible: true },
    bar: { style: { cornerRadius: 4 } },
    color: ['#4285f4', '#ea4335'],
    tooltip: { mark: { content: [{ key: d => d.type, value: d => `$${Number(d.value).toFixed(4)}` }] } },
  };

  const columns = [
    { title: t('渠道'), render: (_, r) => <Text>{r.channel_name || `#${r.channel_id}`}</Text> },
    { title: t('成本系数'), render: (_, r) => r.cost_ratio > 0 ? <Tag color='blue' shape='circle'>{r.cost_ratio}</Tag> : <Text type='tertiary'>-</Text> },
    { title: t('收入'), render: (_, r) => <Text>{fmt(r.revenue)}</Text> },
    { title: t('成本'), render: (_, r) => r.cost_ratio > 0 ? <Text>{fmt(r.cost)}</Text> : <Text type='tertiary'>未配置</Text> },
    { title: t('利润'), render: (_, r) => {
      if (r.cost_ratio <= 0) return <Text type='tertiary'>-</Text>;
      const color = r.profit >= 0 ? 'success' : 'danger';
      return <Text type={color}>{fmt(r.profit)}</Text>;
    }},
    { title: t('利润率'), render: (_, r) => {
      if (r.cost_ratio <= 0) return <Text type='tertiary'>-</Text>;
      const color = r.profit_margin >= 0 ? 'success' : 'danger';
      return <Text type={color}>{fmtPct(r.profit_margin)}</Text>;
    }},
    { title: t('调用次数'), render: (_, r) => <Text>{r.requests?.toLocaleString()}</Text> },
    { title: t('Tokens'), render: (_, r) => <Text>{r.tokens?.toLocaleString()}</Text> },
  ];

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[1200px] mx-auto'>
      <div className='flex items-center gap-2 mb-1'>
        <IconBarChartVStroked size='large' style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>{t('渠道成本分析')}</Title>
      </div>
      <Text type='tertiary'>{t('按渠道统计收入、成本与利润。成本系数在渠道编辑页面「高级设置」中配置。')}</Text>

      {/* 时间筛选 */}
      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: '12px 16px' }}>
        <div className='flex flex-wrap items-center gap-3'>
          <Select value={customRange ? 'custom' : preset} style={{ width: 100 }}
            onChange={(v) => { if (v !== 'custom') { setPreset(v); setCustomRange(null); } }}>
            {PRESETS.map(p => <Select.Option key={p.days} value={p.days}>{p.label}</Select.Option>)}
          </Select>
          <DatePicker type='dateRange' style={{ width: 240 }}
            onChange={(d) => {
              if (d && d[0] && d[1]) {
                setCustomRange({ start: Math.floor(d[0] / 1000), end: Math.floor(d[1] / 1000) });
              } else {
                setCustomRange(null);
              }
            }} />
          <Button icon={<IconRefresh />} onClick={load} loading={loading}>{t('刷新')}</Button>
        </div>
      </Card>

      {/* 汇总卡片 */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mt-4'>
        {[
          { label: t('总收入'), value: fmt(totRevenue), color: 'var(--semi-color-primary)' },
          { label: t('总成本'), value: fmt(totCost), color: '#ea4335' },
          { label: t('总利润'), value: fmt(totProfit), color: totProfit >= 0 ? '#34a853' : '#ea4335' },
          { label: t('整体利润率'), value: fmtPct(totMargin), color: totMargin >= 0 ? '#34a853' : '#ea4335' },
        ].map(item => (
          <Card key={item.label} className='!rounded-2xl shadow-sm' bodyStyle={{ padding: 16 }}>
            <Text type='tertiary' size='small'>{item.label}</Text>
            <div className='text-2xl font-bold mt-1' style={{ color: item.color }}>{item.value}</div>
          </Card>
        ))}
      </div>

      {/* 图表 */}
      {rows.length > 0 && (
        <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 16 }}>
          <Text strong className='block mb-3'>{t('各渠道收入 vs 成本')}</Text>
          <VChart spec={chartSpec} style={{ height: 260 }} />
        </Card>
      )}

      {/* 利润趋势折线图 */}
      {trend.length > 0 && (
        <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 16 }}>
          <Text strong className='block mb-3'>{t('每日利润趋势')}</Text>
          <VChart
            spec={{
              type: 'line',
              data: [{
                id: 'trend_data',
                values: trend.flatMap((d) => [
                  { date: d.date, type: t('收入'), value: Number((d.revenue || 0).toFixed(4)) },
                  { date: d.date, type: t('成本'), value: Number((d.cost || 0).toFixed(4)) },
                  { date: d.date, type: t('利润'), value: Number((d.profit || 0).toFixed(4)) },
                ]),
              }],
              xField: 'date',
              yField: 'value',
              seriesField: 'type',
              legends: { visible: true },
              point: { visible: true },
              line: { style: { lineWidth: 2 } },
              color: ['#4285f4', '#ea4335', '#34a853'],
              tooltip: { mark: { content: [{ key: (d) => d.type, value: (d) => `$${Number(d.value).toFixed(4)}` }] } },
            }}
            style={{ height: 280 }}
          />
        </Card>
      )}

      {/* 明细表 */}
      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 16 }}>
        <Spin spinning={loading}>
          <Table columns={columns} dataSource={rows} rowKey='channel_id'
            pagination={false} size='small'
            footer={() => rows.length > 0 && (
              <div className='flex gap-4 text-sm pt-2'>
                <Text strong>{t('合计')}：</Text>
                <Text>{t('收入')} {fmt(totRevenue)}</Text>
                <Text>{t('成本')} {fmt(totCost)}</Text>
                <Text type={totProfit >= 0 ? 'success' : 'danger'}>{t('利润')} {fmt(totProfit)}</Text>
              </div>
            )}
          />
        </Spin>
      </Card>
    </div>
  );
}
