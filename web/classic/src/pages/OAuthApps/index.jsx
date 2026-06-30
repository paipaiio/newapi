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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Banner,
  Button,
  Card,
  Table,
  Tag,
  Typography,
  Modal,
  Form,
  Switch,
  Space,
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete, IconEdit, IconKey } from '@douyinfe/semi-icons';
import { KeyRound } from 'lucide-react';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

const SCOPE_OPTIONS = [
  { label: 'openid', value: 'openid' },
  { label: 'profile', value: 'profile' },
  { label: 'email', value: 'email' },
  { label: 'groups', value: 'groups' },
];

const emptyForm = {
  id: 0,
  name: '',
  logo: '',
  redirect_uris: '',
  scopes: ['openid', 'profile', 'email'],
  is_public: false,
  auto_approve: false,
  enabled: true,
};

export default function OAuthAppsPage() {
  const { t } = useTranslation();
  const origin = window.location.origin;

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [providerEnabled, setProviderEnabled] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editing, setEditing] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const formApiRef = useRef(null);

  // 创建/轮换后展示一次性凭据
  const [credVisible, setCredVisible] = useState(false);
  const [cred, setCred] = useState({ client_id: '', client_secret: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/oauth_client/');
      if (res?.data?.success) setList(res.data.data || []);
      else showError(res?.data?.message || t('加载失败'));
    } catch (e) {
      showError(t('加载失败'));
    }
    setLoading(false);
  }, [t]);

  const loadProviderEnabled = useCallback(async () => {
    try {
      const res = await API.get('/api/option/');
      if (res?.data?.success) {
        const opt = (res.data.data || []).find(
          (o) => o.key === 'oauth_server.enabled',
        );
        setProviderEnabled(opt?.value === 'true');
      }
    } catch (e) {
      // 忽略
    }
  }, []);

  useEffect(() => {
    loadData();
    loadProviderEnabled();
  }, [loadData, loadProviderEnabled]);

  const toggleProvider = async (checked) => {
    try {
      const res = await API.put('/api/option/', {
        key: 'oauth_server.enabled',
        value: checked ? 'true' : 'false',
      });
      if (res?.data?.success) {
        setProviderEnabled(checked);
        showSuccess(t('已更新'));
      } else {
        showError(res?.data?.message || t('操作失败'));
      }
    } catch (e) {
      showError(t('操作失败'));
    }
  };

  const openEdit = (record) => {
    const data = record
      ? {
          ...record,
          scopes:
            typeof record.scopes === 'string'
              ? record.scopes.split(/\s+/).filter(Boolean)
              : record.scopes || [],
        }
      : { ...emptyForm };
    setEditing(data);
    setEditVisible(true);
    setTimeout(() => {
      formApiRef.current?.setValues(data);
    }, 0);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await formApiRef.current?.validate();
    } catch (e) {
      return;
    }
    const payload = {
      name: values.name,
      logo: values.logo || '',
      redirect_uris: (values.redirect_uris || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      scopes: values.scopes || [],
      is_public: !!values.is_public,
      auto_approve: !!values.auto_approve,
      enabled: !!values.enabled,
    };
    setSaving(true);
    try {
      const res = editing.id
        ? await API.put(`/api/oauth_client/${editing.id}`, payload)
        : await API.post('/api/oauth_client/', payload);
      if (res?.data?.success) {
        showSuccess(t('保存成功'));
        setEditVisible(false);
        loadData();
        // 新建机密客户端：展示一次性密钥
        if (!editing.id && res.data.data?.client_secret) {
          setCred({
            client_id: res.data.data.client?.client_id || '',
            client_secret: res.data.data.client_secret,
          });
          setCredVisible(true);
        }
      } else {
        showError(res?.data?.message || t('保存失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    }
    setSaving(false);
  };

  const toggleEnabled = async (record) => {
    const res = await API.put(`/api/oauth_client/${record.id}`, {
      name: record.name,
      logo: record.logo,
      redirect_uris: (record.redirect_uris || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      scopes:
        typeof record.scopes === 'string'
          ? record.scopes.split(/\s+/).filter(Boolean)
          : record.scopes,
      is_public: record.is_public,
      auto_approve: record.auto_approve,
      enabled: !record.enabled,
    });
    if (res?.data?.success) {
      showSuccess(t('已更新'));
      loadData();
    } else {
      showError(res?.data?.message || t('操作失败'));
    }
  };

  const handleRotate = (record) => {
    Modal.confirm({
      title: t('重置密钥'),
      content: `${t('确定为应用')} "${record.name}" ${t('重新生成密钥？旧密钥将立即失效。')}`,
      type: 'warning',
      onOk: async () => {
        const res = await API.post(`/api/oauth_client/${record.id}/rotate_secret`);
        if (res?.data?.success) {
          setCred({
            client_id: record.client_id,
            client_secret: res.data.data.client_secret,
          });
          setCredVisible(true);
        } else {
          showError(res?.data?.message || t('操作失败'));
        }
      },
    });
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: t('删除应用'),
      content: `${t('确定删除应用')} "${record.name}" ${t('吗？此操作不可恢复')}`,
      type: 'warning',
      onOk: async () => {
        const res = await API.delete(`/api/oauth_client/${record.id}`);
        if (res?.data?.success) {
          showSuccess(t('已删除'));
          loadData();
        } else {
          showError(res?.data?.message || t('删除失败'));
        }
      },
    });
  };

  const columns = [
    {
      title: t('应用'),
      dataIndex: 'name',
      render: (_, record) => (
        <div className='min-w-0'>
          <Text strong className='block truncate'>
            {record.name}
            {record.is_public && (
              <Tag color='orange' size='small' className='ml-2'>
                PKCE
              </Tag>
            )}
            {record.auto_approve && (
              <Tag color='green' size='small' className='ml-1'>
                {t('免同意')}
              </Tag>
            )}
          </Text>
          <Text type='tertiary' size='small' copyable={{ content: record.client_id }}>
            {record.client_id}
          </Text>
        </div>
      ),
    },
    {
      title: t('回调地址'),
      dataIndex: 'redirect_uris',
      render: (v) => (
        <Text type='tertiary' size='small' className='whitespace-pre-line'>
          {v}
        </Text>
      ),
    },
    {
      title: t('Scopes'),
      dataIndex: 'scopes',
      width: 200,
      render: (v) => (
        <Space wrap>
          {(typeof v === 'string' ? v.split(/\s+/) : v || [])
            .filter(Boolean)
            .map((s) => (
              <Tag key={s} color='blue' size='small'>
                {s}
              </Tag>
            ))}
        </Space>
      ),
    },
    {
      title: t('状态'),
      dataIndex: 'enabled',
      width: 80,
      render: (v, record) => (
        <Switch checked={v} size='small' onChange={() => toggleEnabled(record)} />
      ),
    },
    {
      title: t('操作'),
      width: 200,
      render: (_, record) => (
        <Space>
          <Button size='small' icon={<IconEdit />} onClick={() => openEdit(record)}>
            {t('编辑')}
          </Button>
          {!record.is_public && (
            <Button
              size='small'
              icon={<IconKey />}
              theme='borderless'
              onClick={() => handleRotate(record)}
            >
              {t('密钥')}
            </Button>
          )}
          <Button
            size='small'
            type='danger'
            theme='borderless'
            icon={<IconDelete />}
            onClick={() => handleDelete(record)}
          />
        </Space>
      ),
    },
  ];

  const endpoints = [
    { label: t('发现地址 (Issuer)'), value: `${origin}/.well-known/openid-configuration` },
    { label: t('授权端点'), value: `${origin}/oauth2/authorize` },
    { label: t('令牌端点'), value: `${origin}/oauth2/token` },
    { label: t('用户信息端点'), value: `${origin}/oauth2/userinfo` },
    { label: 'JWKS', value: `${origin}/.well-known/jwks.json` },
  ];

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[1100px] mx-auto'>
      <div className='flex items-center gap-2 mb-1'>
        <KeyRound size={22} style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>
          {t('OAuth 应用')}
        </Title>
      </div>
      <Text type='tertiary'>
        {t('让第三方网站/App 通过「使用本站登录」接入本系统账号（OpenID Connect 身份提供方）')}
      </Text>

      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
        <div className='flex justify-between items-center'>
          <div>
            <Text strong>{t('启用 OAuth 登录服务')}</Text>
            <Text type='tertiary' size='small' className='block'>
              {t('关闭后所有第三方接入端点（authorize/token/userinfo）将不可用')}
            </Text>
          </div>
          <Switch checked={providerEnabled} onChange={toggleProvider} />
        </div>
      </Card>

      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
        <Text strong className='block mb-2'>{t('接入信息（提供给第三方）')}</Text>
        {endpoints.map((e) => (
          <div key={e.label} className='flex items-center gap-3 py-1'>
            <Text type='tertiary' style={{ width: 160, flexShrink: 0 }}>
              {e.label}
            </Text>
            <Text size='small' copyable={{ content: e.value }} className='truncate'>
              {e.value}
            </Text>
          </div>
        ))}
      </Card>

      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
        <div className='flex justify-between items-center mb-4'>
          <Text strong>{t('已注册应用')}</Text>
          <Button theme='solid' type='primary' icon={<IconPlus />} onClick={() => openEdit(null)}>
            {t('注册应用')}
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={list}
          loading={loading}
          rowKey='id'
          pagination={false}
          empty={t('暂无应用，点击右上角注册')}
        />
      </Card>

      <Modal
        title={editing.id ? t('编辑应用') : t('注册应用')}
        visible={editVisible}
        onOk={handleSave}
        onCancel={() => setEditVisible(false)}
        okText={t('保存')}
        cancelText={t('取消')}
        confirmLoading={saving}
        maskClosable={false}
        width={560}
      >
        <Form
          getFormApi={(api) => (formApiRef.current = api)}
          initValues={editing}
          labelPosition='top'
        >
          <Form.Input
            field='name'
            label={t('应用名称')}
            placeholder={t('展示给用户的名称，如：客服后台')}
            rules={[{ required: true, message: t('应用名称不能为空') }]}
          />
          <Form.TextArea
            field='redirect_uris'
            label={t('回调地址（每行一个，需精确匹配）')}
            placeholder={'https://app.example.com/callback'}
            autosize={{ minRows: 2 }}
            rules={[{ required: true, message: t('至少填写一个回调地址') }]}
          />
          <Form.Select
            field='scopes'
            label='Scopes'
            multiple
            optionList={SCOPE_OPTIONS}
            style={{ width: '100%' }}
            placeholder='openid profile email'
          />
          <Form.Input
            field='logo'
            label={t('图标 URL（可选）')}
            placeholder='https://...'
          />
          <div className='flex items-center gap-8 mt-2'>
            <Form.Switch field='enabled' label={t('启用')} />
            <Form.Switch field='is_public' label={t('Public 客户端（强制 PKCE，无密钥）')} />
            <Form.Switch field='auto_approve' label={t('免同意（受信任应用）')} />
          </div>
        </Form>
      </Modal>

      <Modal
        title={t('应用凭据（请妥善保存）')}
        visible={credVisible}
        onOk={() => setCredVisible(false)}
        onCancel={() => setCredVisible(false)}
        okText={t('我已保存')}
        hasCancel={false}
        maskClosable={false}
        width={520}
      >
        <Banner
          type='warning'
          description={t('client_secret 仅显示这一次，关闭后无法再次查看。')}
          className='mb-3'
        />
        <Paragraph spacing='extended'>
          <Text strong>client_id</Text>
          <br />
          <Text copyable={{ content: cred.client_id }}>{cred.client_id}</Text>
        </Paragraph>
        {cred.client_secret && (
          <Paragraph spacing='extended'>
            <Text strong>client_secret</Text>
            <br />
            <Text copyable={{ content: cred.client_secret }}>{cred.client_secret}</Text>
          </Paragraph>
        )}
      </Modal>
    </div>
  );
}
