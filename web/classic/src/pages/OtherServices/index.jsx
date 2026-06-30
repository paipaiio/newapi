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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Typography,
  Tag,
  Empty,
  Spin,
  Avatar,
} from '@douyinfe/semi-ui';
import { IconLink } from '@douyinfe/semi-icons';
import { LayoutGrid, ExternalLink } from 'lucide-react';
import { API, showError } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

// 判断 icon 是否为图片 URL（否则当作 emoji/文本展示）
const isImageUrl = (icon) =>
  typeof icon === 'string' &&
  (icon.startsWith('http://') ||
    icon.startsWith('https://') ||
    icon.startsWith('/'));

export default function OtherServicesPage() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/other_service/');
      if (res?.data?.success) setServices(res.data.data || []);
      else showError(res?.data?.message || t('加载失败'));
    } catch (e) {
      showError(t('加载失败'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 按 category 分组（无分类归到「其他」）
  const grouped = useMemo(() => {
    const map = new Map();
    services.forEach((s) => {
      const key = s.category?.trim() || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return Array.from(map.entries());
  }, [services]);

  const openService = (s) => {
    if (!s.url) return;
    if (s.open_in_new_tab) {
      window.open(s.url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = s.url;
    }
  };

  const renderCard = (s) => (
    <Card
      key={s.id}
      shadows='hover'
      className='!rounded-2xl cursor-pointer transition-all hover:-translate-y-1 h-full'
      bodyStyle={{ padding: 24 }}
      onClick={() => openService(s)}
    >
      <div className='flex items-start gap-4'>
        <div className='shrink-0'>
          {isImageUrl(s.icon) ? (
            <Avatar
              shape='square'
              size='large'
              src={s.icon}
              style={{ borderRadius: 14, width: 56, height: 56 }}
            />
          ) : (
            <div
              className='flex items-center justify-center rounded-2xl text-3xl'
              style={{
                width: 56,
                height: 56,
                background: 'var(--semi-color-primary-light-default)',
              }}
            >
              {s.icon || <LayoutGrid size={28} />}
            </div>
          )}
        </div>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-1.5'>
            <Text strong className='truncate' style={{ fontSize: 17 }}>
              {s.name}
            </Text>
            <ExternalLink
              size={15}
              className='shrink-0'
              style={{ color: 'var(--semi-color-text-2)' }}
            />
          </div>
          {s.description ? (
            <Paragraph
              type='tertiary'
              ellipsis={{ rows: 3 }}
              className='!mt-1.5 !mb-0'
              style={{ fontSize: 14, lineHeight: 1.6 }}
            >
              {s.description}
            </Paragraph>
          ) : null}
        </div>
      </div>
    </Card>
  );

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[1100px] mx-auto'>
      <div className='flex items-center gap-2 mb-1'>
        <LayoutGrid size={22} style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>
          {t('其他服务')}
        </Title>
      </div>
      <Text type='tertiary'>
        {t('这里汇集了我们提供的其他服务与工具，点击卡片即可前往')}
      </Text>

      <Spin spinning={loading}>
        {services.length === 0 ? (
          <Empty
            image={<IconLink size='extra-large' />}
            description={t('暂无其他服务')}
            style={{ padding: 60 }}
          />
        ) : (
          <div className='mt-5 space-y-6'>
            {grouped.map(([category, items]) => (
              <div key={category || '__none__'}>
                {category ? (
                  <div className='flex items-center gap-2 mb-3'>
                    <Tag color='blue' shape='circle' size='large'>
                      {category}
                    </Tag>
                  </div>
                ) : null}
                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'>
                  {items.map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
}
