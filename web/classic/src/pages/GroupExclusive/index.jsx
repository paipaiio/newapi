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
  Select,
  Tag,
  Typography,
  Divider,
  Space,
  Modal,
  Empty,
  Spin,
} from '@douyinfe/semi-ui';
import { IconPlus, IconLock, IconDelete } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export default function GroupExclusivePage() {
  const { t } = useTranslation();

  const [exclusiveList, setExclusiveList] = useState([]); // [{group_name, user_ids}]
  const [allGroups, setAllGroups] = useState([]); // 所有已定义分组
  const [loading, setLoading] = useState(false);

  // 编辑弹窗
  const [editVisible, setEditVisible] = useState(false);
  const [editGroup, setEditGroup] = useState('');
  const [editUserIds, setEditUserIds] = useState([]);
  const [userOptions, setUserOptions] = useState([]); // 搜索结果 {label,value}
  const [userLabelMap, setUserLabelMap] = useState({}); // userId -> username 缓存
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [exRes, gRes] = await Promise.all([
        API.get('/api/group/exclusive'),
        API.get('/api/group/'),
      ]);
      if (exRes?.data?.success) setExclusiveList(exRes.data.data || []);
      if (gRes?.data?.success) setAllGroups(gRes.data.data || []);
    } catch (e) {
      showError(t('加载失败'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 拉取用户列表填充下拉。keyword 为空 = 列出一批普通用户供直接勾选。
  const fetchUsers = useCallback((keyword = '') => {
    setSearching(true);
    const kw = keyword ? `&keyword=${encodeURIComponent(keyword)}` : '';
    // 搜索接口需要 keyword，空时退回用户列表接口
    const url = keyword
      ? `/api/user/search?p=1&page_size=30${kw}`
      : `/api/user/?p=1&page_size=30`;
    API.get(url)
      .then((res) => {
        if (res?.data?.success) {
          const items = res.data.data?.items || [];
          const map = {};
          const opts = items.map((u) => {
            map[u.id] = u.username;
            return {
              label: `${u.username} (ID:${u.id})`,
              value: u.id,
            };
          });
          setUserLabelMap((prev) => ({ ...prev, ...map }));
          setUserOptions(opts);
        }
      })
      .catch(() => {})
      .finally(() => setSearching(false));
  }, []);

  // 回查指定用户ID的用户名（编辑已有授权时，把已选用户名填进缓存）
  const resolveUserNames = useCallback((ids) => {
    const missing = ids.filter((id) => !userLabelMap[id]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) =>
        API.get(`/api/user/${id}`)
          .then((res) => (res?.data?.success ? res.data.data : null))
          .catch(() => null),
      ),
    ).then((users) => {
      const map = {};
      users.forEach((u) => {
        if (u && u.id) map[u.id] = u.username;
      });
      if (Object.keys(map).length) {
        setUserLabelMap((prev) => ({ ...prev, ...map }));
      }
    });
  }, [userLabelMap]);

  const openEdit = (groupName, userIds) => {
    setEditGroup(groupName);
    setEditUserIds(userIds || []);
    setEditVisible(true);
    fetchUsers(''); // 打开即预加载用户列表，可直接勾选
    if (userIds && userIds.length) resolveUserNames(userIds);
  };

  const handleSave = async () => {
    if (!editGroup) {
      showError(t('请选择分组'));
      return;
    }
    setSaving(true);
    try {
      const res = await API.post('/api/group/exclusive', {
        group_name: editGroup,
        user_ids: editUserIds,
      });
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

  const handleRemoveExclusive = (groupName) => {
    Modal.confirm({
      title: t('取消独享'),
      content: `${t('确定取消分组')} "${groupName}" ${t('的独享限制吗？取消后将恢复默认可见性规则')}`,
      onOk: async () => {
        const res = await API.post('/api/group/exclusive', {
          group_name: groupName,
          user_ids: [],
        });
        if (res?.data?.success) {
          showSuccess(t('已取消独享'));
          loadData();
        } else {
          showError(res?.data?.message || t('操作失败'));
        }
      },
    });
  };

  // 可新建独享的分组（排除已是独享的）
  const exclusiveNames = new Set(exclusiveList.map((e) => e.group_name));
  const availableGroups = allGroups
    .filter((g) => !exclusiveNames.has(g))
    .map((g) => ({ label: g, value: g }));

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[1000px] mx-auto'>
      <div className='flex items-center gap-2 mb-1'>
        <IconLock size='large' style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>
          {t('独享分组')}
        </Title>
      </div>
      <Text type='tertiary'>
        {t('被标记为独享的分组，默认对所有用户隐藏，只有被授权的用户才能使用')}
      </Text>

      <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 20 }}>
        <div className='flex justify-between items-center mb-4'>
          <Text strong>{t('独享分组列表')}</Text>
          <Button
            theme='solid'
            type='primary'
            icon={<IconPlus />}
            onClick={() => openEdit('', [])}
          >
            {t('新建独享分组')}
          </Button>
        </div>

        <Spin spinning={loading}>
          {exclusiveList.length === 0 ? (
            <Empty
              image={<IconLock size='extra-large' />}
              description={t('暂无独享分组')}
              style={{ padding: 30 }}
            />
          ) : (
            <Space vertical align='start' style={{ width: '100%' }} spacing={12}>
              {exclusiveList.map((item) => (
                <div
                  key={item.group_name}
                  className='w-full flex items-center justify-between p-3 rounded-xl'
                  style={{ background: 'var(--semi-color-fill-0)' }}
                >
                  <div className='flex items-center gap-3 flex-wrap'>
                    <Tag color='violet' shape='circle' size='large'>
                      {item.group_name}
                    </Tag>
                    <Text type='tertiary' size='small'>
                      {item.user_ids.length} {t('位授权用户')}：
                    </Text>
                    <Space wrap>
                      {item.user_ids.map((uid) => (
                        <Tag key={uid} color='blue' shape='circle'>
                          {userLabelMap[uid]
                            ? `${userLabelMap[uid]} (${uid})`
                            : `ID:${uid}`}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                  <Space>
                    <Button
                      size='small'
                      onClick={() => openEdit(item.group_name, item.user_ids)}
                    >
                      {t('编辑授权')}
                    </Button>
                    <Button
                      size='small'
                      type='danger'
                      theme='borderless'
                      icon={<IconDelete />}
                      onClick={() => handleRemoveExclusive(item.group_name)}
                    >
                      {t('取消独享')}
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Spin>
      </Card>

      <Modal
        title={editGroup ? `${t('编辑授权')}：${editGroup}` : t('新建独享分组')}
        visible={editVisible}
        onOk={handleSave}
        onCancel={() => setEditVisible(false)}
        okText={t('保存')}
        cancelText={t('取消')}
        confirmLoading={saving}
        maskClosable={false}
      >
        <div className='space-y-4 py-2'>
          {!editGroup && (
            <div>
              <Text strong className='block mb-2'>
                {t('选择分组')}
              </Text>
              <Select
                placeholder={t('选择要设为独享的分组')}
                optionList={availableGroups}
                value={editGroup || undefined}
                onChange={setEditGroup}
                filter
                style={{ width: '100%' }}
                emptyContent={t('没有可用分组（请先在分组倍率中定义）')}
              />
            </div>
          )}
          <div>
            <Text strong className='block mb-2'>
              {t('授权用户')}
            </Text>
            <Select
              multiple
              filter
              remote
              maxTagCount={6}
              placeholder={t('点击展开选择用户，或输入用户名搜索')}
              value={editUserIds}
              optionList={[
                // 保证已选项可见（即便不在当前搜索结果里）
                ...editUserIds
                  .filter((id) => !userOptions.some((o) => o.value === id))
                  .map((id) => ({
                    label: userLabelMap[id] ? `${userLabelMap[id]} (ID:${id})` : `ID:${id}`,
                    value: id,
                  })),
                ...userOptions,
              ]}
              onSearch={(kw) => fetchUsers(kw)}
              onChange={setEditUserIds}
              onFocus={() => {
                if (userOptions.length === 0) fetchUsers('');
              }}
              loading={searching}
              style={{ width: '100%' }}
              maxHeight={260}
              emptyContent={searching ? t('加载中...') : t('暂无用户')}
            />
            <Text type='tertiary' size='small' className='block mt-2'>
              {t('留空并保存 = 取消该分组的独享限制')}
            </Text>
          </div>
        </div>
      </Modal>
    </div>
  );
}
