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
  Button,
  Card,
  Table,
  Tag,
  Typography,
  Modal,
  Form,
  Switch,
  Avatar,
  Space,
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete, IconEdit } from '@douyinfe/semi-icons';
import { Boxes } from 'lucide-react';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const isImageUrl = (icon) =>
  typeof icon === 'string' &&
  (icon.startsWith('http://') ||
    icon.startsWith('https://') ||
    icon.startsWith('/'));

const emptyForm = {
  id: 0,
  name: '',
  description: '',
  url: '',
  icon: '',
  category: '',
  sort_order: 0,
  enabled: true,
  open_in_new_tab: true,
};

export default function ServiceManagePage() {
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editing, setEditing] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const formApiRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/other_service/all');
      if (res?.data?.success) setList(res.data.data || []);
      else showError(res?.data?.message || t('加载失败'));
    } catch (e) {
      showError(t('加载失败'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openEdit = (record) => {
    const data = record ? { ...record } : { ...emptyForm };
    setEditing(data);
    setEditVisible(true);
    // Form 通过 initValues 渲染，等下一拍 formApi 就绪后兜底 setValues
    setTimeout(() => {
      formApiRef.current?.setValues(data);
    }, 0);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await formApiRef.current?.validate();
    } catch (e) {
      return; // 校验失败
    }
    const payload = {
      ...editing,
      ...values,
      sort_order: Number(values.sort_order) || 0,
    };
    setSaving(true);
    try {
      const res = editing.id
        ? await API.put('/api/other_service/', payload)
        : await API.post('/api/other_service/', payload);
      if (res?.data?.success) {
        showSuccess(t('保存成功'));
        setEditVisible(false);
        loadData();
      } else {
        showError(res?.data?.message || t('保存失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    }
    setSaving(false);
  };

  // 行内快速切换启用状态
  const toggleEnabled = async (record) => {
    const res = await API.put('/api/other_service/', {
      ...record,
      enabled: !record.enabled,
    });
    if (res?.data?.success) {
      showSuccess(t('已更新'));
      loadData();
    } else {
      showError(res?.data?.message || t('操作失败'));
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: t('删除服务'),
      content: `${t('确定删除服务')} "${record.name}" ${t('吗？此操作不可恢复')}`,
      type: 'warning',
      onOk: async () => {
        const res = await API.delete(`/api/other_service/${record.id}`);
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
      title: t('排序'),
      dataIndex: 'sort_order',
      width: 70,
      render: (v) => <Text type='tertiary'>{v}</Text>,
    },
    {
      title: t('服务'),
      dataIndex: 'name',
      render: (_, record) => (
        <div className='flex items-center gap-3'>
          {isImageUrl(record.icon) ? (
            <Avatar shape='square' size='small' src={record.icon} style={{ borderRadius: 8 }} />
          ) : (
            <div
              className='flex items-center justify-center rounded-lg text-lg'
              style={{
                width: 32,
                height: 32,
                background: 'var(--semi-color-fill-1)',
              }}
            >
              {record.icon || '🔗'}
            </div>
          )}
          <div className='min-w-0'>
            <Text strong className='block truncate'>{record.name}</Text>
            <Text type='tertiary' size='small' className='block truncate' style={{ maxWidth: 280 }}>
              {record.description}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: t('分类'),
      dataIndex: 'category',
      width: 120,
      render: (v) =>
        v ? <Tag color='blue' shape='circle'>{v}</Tag> : <Text type='tertiary'>—</Text>,
    },
    {
      title: t('链接'),
      dataIndex: 'url',
      render: (v) => (
        <a href={v} target='_blank' rel='noopener noreferrer' className='text-blue-500 truncate inline-block' style={{ maxWidth: 240 }}>
          {v}
        </a>
      ),
    },
    {
      title: t('状态'),
      dataIndex: 'enabled',
      width: 90,
      render: (v, record) => (
        <Switch checked={v} size='small' onChange={() => toggleEnabled(record)} />
      ),
    },
    {
      title: t('操作'),
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size='small' icon={<IconEdit />} onClick={() => openEdit(record)}>
            {t('编辑')}
          </Button>
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

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[1100px] mx-auto'>
      <div className='flex items-center gap-2 mb-1'>
        <Boxes size={22} style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>
          {t('服务管理')}
        </Title>
      </div>
      <Text type='tertiary'>
        {t('维护「其他服务」页面展示的服务条目，所有登录用户都能在侧边栏看到已启用的服务')}
      </Text>

      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
        <div className='flex justify-between items-center mb-4'>
          <Text strong>{t('服务列表')}</Text>
          <Button theme='solid' type='primary' icon={<IconPlus />} onClick={() => openEdit(null)}>
            {t('新增服务')}
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={list}
          loading={loading}
          rowKey='id'
          pagination={false}
          empty={t('暂无服务，点击右上角新增')}
        />
      </Card>

      <Modal
        title={editing.id ? t('编辑服务') : t('新增服务')}
        visible={editVisible}
        onOk={handleSave}
        onCancel={() => setEditVisible(false)}
        okText={t('保存')}
        cancelText={t('取消')}
        confirmLoading={saving}
        maskClosable={false}
        width={520}
      >
        <Form
          getFormApi={(api) => (formApiRef.current = api)}
          initValues={editing}
          labelPosition='top'
        >
          <Form.Input
            field='name'
            label={t('服务名称')}
            placeholder={t('如：监控面板')}
            rules={[{ required: true, message: t('服务名称不能为空') }]}
          />
          <Form.Input
            field='url'
            label={t('服务链接')}
            placeholder='https://example.com'
            rules={[{ required: true, message: t('服务链接不能为空') }]}
          />
          <Form.TextArea
            field='description'
            label={t('描述')}
            placeholder={t('简短介绍这个服务的用途（可选）')}
            autosize
            maxCount={512}
          />
          <Form.Input
            field='icon'
            label={t('图标')}
            placeholder={t('emoji（如 🚀）或图片 URL（http 开头）')}
          />
          <Form.Input
            field='category'
            label={t('分类')}
            placeholder={t('用于分组展示，可选（如：开发工具）')}
          />
          <Form.InputNumber
            field='sort_order'
            label={t('排序')}
            placeholder='0'
            min={0}
            style={{ width: '100%' }}
          />
          <div className='flex items-center gap-8 mt-2'>
            <Form.Switch field='enabled' label={t('启用')} />
            <Form.Switch field='open_in_new_tab' label={t('新标签页打开')} />
          </div>
        </Form>
      </Modal>
    </div>
  );
}
