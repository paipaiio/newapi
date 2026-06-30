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

import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Card,
  Input,
  InputNumber,
  TextArea,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  Divider,
  RadioGroup,
  Radio,
  Space,
  Spin,
  Empty,
} from '@douyinfe/semi-ui';
import {
  IconDownload,
  IconPlus,
  IconDelete,
  IconCreditCard,
} from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const buildRow = (opts = {}) => ({
  id: Math.random().toString(36).slice(2),
  username: opts.username || '',
  password: opts.password || '',
  customKey: opts.customKey || '',
  group: opts.group || 'default',
  quota: opts.quota ?? 10,
  unlimited: opts.unlimited ?? false,
  status: '',
  apiKey: '',
  errMsg: '',
});

export default function ApiSalePage() {
  const { t } = useTranslation();

  const [mode, setMode] = useState('generate');
  const [count, setCount] = useState(10);
  const [importText, setImportText] = useState('');

  const [defGroup, setDefGroup] = useState('default');
  const [defQuota, setDefQuota] = useState(10);
  const [defUnlimited, setDefUnlimited] = useState(false);
  const [defExclusive, setDefExclusive] = useState(false);
  const [batchId, setBatchId] = useState('');

  const [rows, setRows] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [created, setCreated] = useState(false);

  // 批次统计
  const [batchStats, setBatchStats] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const loadBatchStats = useCallback(() => {
    setBatchLoading(true);
    API.get('/api/user/batch/stats')
      .then((res) => {
        if (res?.data?.success) setBatchStats(res.data.data || []);
      })
      .catch(() => {})
      .finally(() => setBatchLoading(false));
  }, []);

  useEffect(() => {
    loadBatchStats();
  }, [loadBatchStats]);

  // 导出某批次的账户清单 CSV（按 batch_id 反查全部 token）
  const exportBatch = async (bid) => {
    try {
      const res = await API.get(
        `/api/user/token/lookup?keyword=${encodeURIComponent(bid)}&p=1&page_size=1000`,
      );
      if (!res?.data?.success) {
        showError(res?.data?.message || t('导出失败'));
        return;
      }
      const items = (res.data.data?.items || []).filter((it) => it.batch_id === bid);
      if (!items.length) {
        showError(t('该批次无记录'));
        return;
      }
      const header = 'username,email,api_key,group,batch_id\n';
      const body = items
        .map(
          (it) =>
            `${it.username || ''},${it.email || ''},${it.full_key || ''},${it.group || ''},${it.batch_id || ''}`,
        )
        .join('\n');
      const blob = new Blob(['﻿' + header + body], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch_${bid}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess(t('已导出该批次清单'));
    } catch {
      showError(t('请求失败'));
    }
  };

  useEffect(() => {
    API.get('/api/group/').then((res) => {
      if (res?.data?.data) {
        setGroupOptions(res.data.data.map((g) => ({ label: g, value: g })));
        if (res.data.data.length) setDefGroup(res.data.data[0]);
      }
    });
  }, []);

  const handlePreview = () => {
    let newRows = [];
    if (mode === 'generate') {
      for (let i = 0; i < (count || 1); i++) {
        newRows.push(
          buildRow({ group: defGroup, quota: defQuota, unlimited: defUnlimited }),
        );
      }
    } else {
      const keys = importText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!keys.length) {
        showError(t('请至少输入一个 API Key'));
        return;
      }
      keys.forEach((k) =>
        newRows.push(
          buildRow({
            customKey: k,
            group: defGroup,
            quota: defQuota,
            unlimited: defUnlimited,
          }),
        ),
      );
    }
    setRows(newRows);
    setHasPreviewed(true);
    setCreated(false);
  };

  const updateRow = useCallback((id, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  }, []);

  const deleteRow = useCallback((id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleBatchCreate = async () => {
    if (!rows.length) {
      showError(t('没有要创建的条目'));
      return;
    }
    setLoading(true);
    const items = rows.map((r) => ({
      username: r.username,
      password: r.password,
      custom_key: r.customKey,
      group: r.group,
      quota: r.quota,
      unlimited: r.unlimited,
      exclusive: defExclusive,
      batch_id: batchId.trim(),
    }));
    try {
      const res = await API.post('/api/user/api-sale/batch', items);
      if (res?.data?.success) {
        const data = res.data.data;
        setRows((prev) =>
          prev.map((r, i) => ({
            ...r,
            username: data[i]?.username || r.username,
            password: data[i]?.password || r.password,
            apiKey: data[i]?.api_key || '',
            status: data[i]?.error ? 'error' : 'ok',
            errMsg: data[i]?.error || '',
          })),
        );
        const failed = data.filter((d) => d.error).length;
        if (failed === 0) showSuccess(`全部 ${data.length} 条创建成功`);
        else showError(`${failed} 条失败，${data.length - failed} 条成功`);
        setCreated(true);
      } else {
        showError(res?.data?.message || t('批量创建失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    }
    setLoading(false);
  };

  const handleDownload = () => {
    const header = 'username,password,api_key,group,quota,batch_id\n';
    const body = rows
      .filter((r) => r.status === 'ok')
      .map(
        (r) =>
          `${r.username},${r.password},${r.apiKey},${r.group},${r.unlimited ? 'unlimited' : r.quota},${batchId.trim()}`,
      )
      .join('\n');
    const blob = new Blob(['﻿' + header + body], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api_keys_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const successCount = rows.filter((r) => r.status === 'ok').length;

  const columns = [
    {
      title: '#',
      width: 56,
      render: (_, __, idx) => <Text type='tertiary'>{idx + 1}</Text>,
    },
    {
      title: t('用户名'),
      dataIndex: 'username',
      render: (v, r) =>
        r.status === 'ok' ? (
          <Text>{v}</Text>
        ) : (
          <Input
            size='small'
            value={v}
            placeholder={t('自动生成')}
            onChange={(val) => updateRow(r.id, 'username', val)}
          />
        ),
    },
    {
      title: t('密码'),
      dataIndex: 'password',
      render: (v, r) =>
        r.status === 'ok' ? (
          <Text copyable>{v}</Text>
        ) : (
          <Input
            size='small'
            value={v}
            placeholder={t('自动生成')}
            onChange={(val) => updateRow(r.id, 'password', val)}
          />
        ),
    },
    {
      title: 'API Key',
      dataIndex: 'customKey',
      render: (v, r) =>
        r.status === 'ok' ? (
          <Text
            copyable={{ content: r.apiKey }}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
            ellipsis={{ showTooltip: true }}
            className='max-w-[220px]'
          >
            {r.apiKey}
          </Text>
        ) : (
          <Input
            size='small'
            value={v}
            placeholder={t('自动生成')}
            onChange={(val) => updateRow(r.id, 'customKey', val)}
          />
        ),
    },
    {
      title: t('分组'),
      dataIndex: 'group',
      width: 150,
      render: (v, r) =>
        r.status === 'ok' ? (
          <Tag color='blue' shape='circle'>
            {v}
          </Tag>
        ) : (
          <Select
            size='small'
            value={v}
            optionList={groupOptions}
            onChange={(val) => updateRow(r.id, 'group', val)}
            style={{ width: '100%' }}
          />
        ),
    },
    {
      title: t('额度'),
      width: 180,
      render: (_, r) =>
        r.status === 'ok' ? (
          <Text>{r.unlimited ? t('无限') : r.quota}</Text>
        ) : (
          <Space>
            <Switch
              size='small'
              checked={r.unlimited}
              onChange={(v) => updateRow(r.id, 'unlimited', v)}
            />
            <Text type='tertiary' size='small'>
              {t('无限')}
            </Text>
            {!r.unlimited && (
              <InputNumber
                size='small'
                value={r.quota}
                min={0}
                style={{ width: 90 }}
                onChange={(v) => updateRow(r.id, 'quota', v)}
              />
            )}
          </Space>
        ),
    },
    {
      title: t('状态'),
      width: 90,
      render: (_, r) => {
        if (!r.status) return <Tag color='grey' shape='circle'>{t('待创建')}</Tag>;
        if (r.status === 'ok')
          return (
            <Tag color='green' shape='circle'>
              {t('成功')}
            </Tag>
          );
        return (
          <Tag color='red' shape='circle' title={r.errMsg}>
            {t('失败')}
          </Tag>
        );
      },
    },
    {
      title: '',
      width: 56,
      render: (_, r) =>
        r.status !== 'ok' && (
          <Button
            size='small'
            type='danger'
            theme='borderless'
            icon={<IconDelete />}
            onClick={() => deleteRow(r.id)}
          />
        ),
    },
  ];

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[1200px] mx-auto'>
      {/* 标题 */}
      <div className='flex items-center gap-2 mb-1'>
        <IconCreditCard size='large' style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>
          {t('API 售卖')}
        </Title>
      </div>
      <Text type='tertiary'>
        {t('批量创建用户账户和对应 API Key，支持导出凭证 CSV')}
      </Text>

      {/* 配置卡片 */}
      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
        <div className='flex flex-wrap gap-x-8 gap-y-5 items-start'>
          <div>
            <Text strong className='block mb-2'>
              {t('生成方式')}
            </Text>
            <RadioGroup
              type='button'
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setHasPreviewed(false);
                setRows([]);
              }}
            >
              <Radio value='generate'>{t('自动生成')}</Radio>
              <Radio value='import'>{t('导入 Key')}</Radio>
            </RadioGroup>
          </div>

          {mode === 'generate' ? (
            <div>
              <Text strong className='block mb-2'>
                {t('数量')}
              </Text>
              <InputNumber
                value={count}
                min={1}
                max={500}
                onChange={setCount}
                style={{ width: 120 }}
              />
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 300 }}>
              <Text strong className='block mb-2'>
                {t('API Keys（每行一个）')}
              </Text>
              <TextArea
                value={importText}
                onChange={setImportText}
                autosize={{ minRows: 2, maxRows: 6 }}
                placeholder={'sk-abc123\nsk-def456'}
              />
            </div>
          )}

          <div>
            <Text strong className='block mb-2'>
              {t('默认分组')}
            </Text>
            <Select
              value={defGroup}
              optionList={groupOptions}
              onChange={setDefGroup}
              style={{ width: 160 }}
            />
          </div>

          <div>
            <Text strong className='block mb-2'>
              {t('无限额度')}
            </Text>
            <div className='h-8 flex items-center'>
              <Switch checked={defUnlimited} onChange={setDefUnlimited} />
            </div>
          </div>

          {!defUnlimited && (
            <div>
              <Text strong className='block mb-2'>
                {t('默认额度')}
              </Text>
              <InputNumber
                value={defQuota}
                min={0}
                onChange={setDefQuota}
                style={{ width: 140 }}
              />
            </div>
          )}

          <div>
            <Text strong className='block mb-2'>
              {t('设为独享')}
            </Text>
            <div className='h-8 flex items-center'>
              <Switch checked={defExclusive} onChange={setDefExclusive} />
            </div>
          </div>

          <div>
            <Text strong className='block mb-2'>
              {t('批次名')}
            </Text>
            <Input
              value={batchId}
              onChange={setBatchId}
              placeholder={t('如 vip客户-0624')}
              style={{ width: 180 }}
              showClear
            />
          </div>

          <div className='flex flex-col justify-end self-stretch'>
            <Button
              theme='solid'
              type='primary'
              icon={<IconPlus />}
              onClick={handlePreview}
              size='large'
            >
              {t('生成预览')}
            </Button>
          </div>
        </div>
        {defExclusive && (
          <div className='mt-3'>
            <Text type='warning' size='small'>
              {t('已开启独享：本批新账户将被加入所选分组的独享授权名单，该分组仅这些账户可用')}
            </Text>
          </div>
        )}
      </Card>

      {/* 表格卡片 */}
      {hasPreviewed && (
        <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
          <div className='flex justify-between items-center mb-4'>
            <Space>
              <Text strong>{t('预览明细')}</Text>
              <Tag color='blue' shape='circle'>
                {rows.length} {t('条')}
              </Tag>
              {created && (
                <Tag color='green' shape='circle'>
                  {t('成功')} {successCount}
                </Tag>
              )}
            </Space>
            <Space>
              <Button
                theme='solid'
                type='primary'
                loading={loading}
                onClick={handleBatchCreate}
                disabled={!rows.length || created}
              >
                {t('批量创建')}
              </Button>
              {created && successCount > 0 && (
                <Button icon={<IconDownload />} onClick={handleDownload}>
                  {t('下载 CSV')}
                </Button>
              )}
            </Space>
          </div>
          <Spin spinning={loading}>
            <Table
              columns={columns}
              dataSource={rows}
              rowKey='id'
              pagination={
                rows.length > 50 ? { pageSize: 50, formatPageText: false } : false
              }
              size='small'
              empty={<Empty description={t('暂无数据')} />}
            />
          </Spin>
        </Card>
      )}

      {/* 批次统计区块 */}
      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
        <div className='flex justify-between items-center mb-4'>
          <Text strong>{t('历史批次')}</Text>
          <Button size='small' icon={<IconDownload />} onClick={loadBatchStats} loading={batchLoading}>
            {t('刷新')}
          </Button>
        </div>
        <Spin spinning={batchLoading}>
          {batchStats.length === 0 ? (
            <Empty description={t('暂无批次记录（创建时填写批次名才会显示）')} style={{ padding: 20 }} />
          ) : (
            <Table
              size='small'
              pagination={false}
              dataSource={batchStats}
              rowKey='batch_id'
              columns={[
                { title: t('批次名'), render: (_, r) => <Tag color='violet' shape='circle'>{r.batch_id}</Tag> },
                { title: t('账户数'), render: (_, r) => <Text>{r.user_count}</Text>, width: 80 },
                { title: t('总余额(内部)'), render: (_, r) => <Text>{(r.total_remain / 500000).toFixed(2)} USD</Text>, width: 140 },
                { title: t('已用(内部)'), render: (_, r) => <Text type='tertiary'>{(r.total_used / 500000).toFixed(2)} USD</Text>, width: 130 },
                { title: t('创建时间'), render: (_, r) => <Text type='tertiary' size='small'>{r.created ? new Date(r.created * 1000).toLocaleString('zh-CN', { hour12: false }) : '-'}</Text> },
                {
                  title: '',
                  width: 100,
                  render: (_, r) => (
                    <Button size='small' icon={<IconDownload />} onClick={() => exportBatch(r.batch_id)}>
                      {t('导出清单')}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Spin>
      </Card>
    </div>
  );
}
