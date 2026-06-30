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

import React, { useState } from 'react';
import {
  Button, Card, Input, Table, Tag, Typography, Empty, Spin, Modal, InputNumber,
} from '@douyinfe/semi-ui';
import { IconSearch, IconCopy } from '@douyinfe/semi-icons';
import { API, showError, showSuccess, copy } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const QUOTA_PER_UNIT = 500000;
const fmtQuota = (q) => {
  if (q == null) return '-';
  return `$${(q / QUOTA_PER_UNIT).toFixed(4)}`;
};
const fmtTime = (t) => (t ? new Date(t * 1000).toLocaleString('zh-CN', { hour12: false }) : '-');

export default function TokenLookupPage() {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [rlModal, setRlModal] = useState(false);
  const [rlToken, setRlToken] = useState(null);
  const [rlRpm, setRlRpm] = useState(0);
  const [rlTpm, setRlTpm] = useState(0);
  const [rlSaving, setRlSaving] = useState(false);

  const openRateLimit = (row) => {
    setRlToken(row);
    setRlRpm(row.rpm || 0);
    setRlTpm(row.tpm || 0);
    setRlModal(true);
  };

  const saveRateLimit = async () => {
    setRlSaving(true);
    try {
      const res = await API.post('/api/user/token/rate_limit', {
        token_id: rlToken.id,
        rpm: rlRpm || 0,
        tpm: rlTpm || 0,
      });
      if (res?.data?.success) {
        showSuccess(t('限流设置已保存'));
        setRlModal(false);
        setRows((prev) => prev.map((r) => (r.id === rlToken.id ? { ...r, rpm: rlRpm, tpm: rlTpm } : r)));
      } else {
        showError(res?.data?.message || t('保存失败'));
      }
    } catch {
      showError(t('请求失败'));
    }
    setRlSaving(false);
  };

  const search = async () => {
    if (!keyword.trim()) {
      showError(t('请输入 API Key、用户名或批次号'));
      return;
    }
    setLoading(true);
    try {
      const res = await API.get(
        `/api/user/token/lookup?keyword=${encodeURIComponent(keyword.trim())}&p=1&page_size=100`,
      );
      if (res?.data?.success) {
        setRows(res.data.data?.items || []);
      } else {
        showError(res?.data?.message || t('查询失败'));
      }
    } catch {
      showError(t('请求失败'));
    }
    setLoading(false);
    setSearched(true);
  };

  const columns = [
    { title: t('用户名'), render: (_, r) => <Text strong>{r.username || `ID:${r.user_id}`}</Text> },
    { title: t('邮箱'), render: (_, r) => <Text type='tertiary'>{r.email || '-'}</Text> },
    { title: 'API Key', render: (_, r) => (
      <div className='flex items-center gap-1'>
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.key}</Text>
        <Button
          size='small'
          theme='borderless'
          type='tertiary'
          icon={<IconCopy />}
          onClick={async () => {
            if (await copy(r.full_key)) {
              showSuccess(t('已复制完整 Key'));
            } else {
              showError(t('复制失败'));
            }
          }}
        />
      </div>
    ) },
    { title: t('批次'), render: (_, r) => r.batch_id ? <Tag color='violet' shape='circle'>{r.batch_id}</Tag> : <Text type='tertiary'>-</Text> },
    { title: t('分组'), render: (_, r) => <Tag color='blue' shape='circle'>{r.group || 'default'}</Tag> },
    { title: t('已用'), render: (_, r) => <Text>{fmtQuota(r.used_quota)}</Text> },
    { title: t('状态'), render: (_, r) => r.status === 1 ? <Tag color='green' shape='circle'>{t('启用')}</Tag> : <Tag color='red' shape='circle'>{t('禁用')}</Tag> },
    { title: 'RPM/TPM', render: (_, r) => <Text type='tertiary' size='small'>{(r.rpm || 0)} / {(r.tpm || 0)}</Text> },
    { title: t('创建时间'), render: (_, r) => <Text type='tertiary' size='small'>{fmtTime(r.created_time)}</Text> },
    { title: t('操作'), render: (_, r) => (
      <Button size='small' onClick={() => openRateLimit(r)}>{t('设置限流')}</Button>
    ) },
  ];

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[1200px] mx-auto'>
      <div className='flex items-center gap-2 mb-1'>
        <IconSearch size='large' style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>{t('Token 反查')}</Title>
      </div>
      <Text type='tertiary'>{t('输入 API Key、用户名或批次号，查询密钥归属的账户。丢失导出表格时用于找回账户。')}</Text>

      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 16 }}>
        <div className='flex gap-2'>
          <Input
            value={keyword}
            onChange={setKeyword}
            onEnterPress={search}
            placeholder={t('API Key / 用户名 / 批次号（支持模糊）')}
            prefix={<IconSearch />}
            showClear
            style={{ flex: 1 }}
          />
          <Button theme='solid' type='primary' loading={loading} onClick={search}>
            {t('查询')}
          </Button>
        </div>
      </Card>

      {searched && (
        <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 16 }}>
          <Spin spinning={loading}>
            {rows.length === 0 ? (
              <Empty description={t('未找到匹配的 Token')} style={{ padding: 30 }} />
            ) : (
              <>
                <Text type='tertiary' size='small' className='block mb-2'>{t('共')} {rows.length} {t('条')}</Text>
                <Table columns={columns} dataSource={rows} rowKey='id' pagination={false} size='small' />
              </>
            )}
          </Spin>
        </Card>
      )}

      <Modal
        title={rlToken ? `${t('设置限流')}：${rlToken.username || rlToken.key}` : t('设置限流')}
        visible={rlModal}
        onOk={saveRateLimit}
        onCancel={() => setRlModal(false)}
        confirmLoading={rlSaving}
        okText={t('保存')}
        cancelText={t('取消')}
      >
        <div className='flex flex-col gap-3 py-2'>
          <div>
            <Text strong className='block mb-1'>RPM {t('（每分钟请求数，0=不限）')}</Text>
            <InputNumber value={rlRpm} min={0} step={1} onChange={setRlRpm} style={{ width: '100%' }} />
          </div>
          <div>
            <Text strong className='block mb-1'>TPM {t('（每分钟 token 数，0=不限）')}</Text>
            <InputNumber value={rlTpm} min={0} step={1} onChange={setRlTpm} style={{ width: '100%' }} />
          </div>
          <Text type='tertiary' size='small'>
            {t('此为单个 API Key 的限流。与用户级、渠道级限流叠加生效，取最严格者。')}
          </Text>
        </div>
      </Modal>
    </div>
  );
}
