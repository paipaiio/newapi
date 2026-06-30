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
  Button, Card, Switch, InputNumber, Typography, Divider, Spin, Banner,
} from '@douyinfe/semi-ui';
import { IconBell } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const QUOTA_PER_UNIT = 500000;

export default function AlertSettingPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState({
    enabled: false,
    abnormal_usage_enabled: false,
    abnormal_usage_threshold: 5000000,
    quota_surge_enabled: false,
    quota_surge_threshold: 50000000,
    daily_report_enabled: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      if (res?.data?.success) {
        const map = {};
        (res.data.data || []).forEach((o) => { map[o.key] = o.value; });
        setCfg({
          enabled: map['alert_setting.enabled'] === 'true',
          abnormal_usage_enabled: map['alert_setting.abnormal_usage_enabled'] === 'true',
          abnormal_usage_threshold: parseInt(map['alert_setting.abnormal_usage_threshold'] || '5000000'),
          quota_surge_enabled: map['alert_setting.quota_surge_enabled'] === 'true',
          quota_surge_threshold: parseInt(map['alert_setting.quota_surge_threshold'] || '50000000'),
          daily_report_enabled: map['alert_setting.daily_report_enabled'] === 'true',
        });
      }
    } catch { showError(t('加载失败')); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const items = [
      ['alert_setting.enabled', String(cfg.enabled)],
      ['alert_setting.abnormal_usage_enabled', String(cfg.abnormal_usage_enabled)],
      ['alert_setting.abnormal_usage_threshold', String(cfg.abnormal_usage_threshold)],
      ['alert_setting.quota_surge_enabled', String(cfg.quota_surge_enabled)],
      ['alert_setting.quota_surge_threshold', String(cfg.quota_surge_threshold)],
      ['alert_setting.daily_report_enabled', String(cfg.daily_report_enabled)],
    ];
    try {
      const results = await Promise.all(
        items.map(([key, value]) => API.put('/api/option/', { key, value })),
      );
      if (results.some((r) => r === undefined)) {
        showError(t('部分保存失败，请重试'));
      } else {
        showSuccess(t('保存成功'));
      }
    } catch { showError(t('保存失败')); }
    setSaving(false);
  };

  const set = (k, v) => setCfg((prev) => ({ ...prev, [k]: v }));

  return (
    <div className='mt-[60px] px-4 pb-8 max-w-[800px] mx-auto'>
      <div className='flex items-center gap-2 mb-1'>
        <IconBell size='large' style={{ color: 'var(--semi-color-primary)' }} />
        <Title heading={3} style={{ margin: 0 }}>{t('邮件告警')}</Title>
      </div>
      <Text type='tertiary'>{t('通过站点 SMTP 向超级管理员邮箱发送告警。需先在「系统设置」配置 SMTP。')}</Text>

      <Spin spinning={loading}>
        <Card className='!rounded-2xl mt-4 shadow-sm' bodyStyle={{ padding: 24 }}>
          {/* 总开关 */}
          <div className='flex items-center justify-between'>
            <div>
              <Text strong>{t('启用邮件告警')}</Text>
              <Text type='tertiary' size='small' className='block'>{t('总开关，关闭后所有告警均不发送')}</Text>
            </div>
            <Switch checked={cfg.enabled} onChange={(v) => set('enabled', v)} />
          </div>

          {!cfg.enabled && (
            <Banner type='info' description={t('告警未启用')} className='mt-3' closeIcon={null} />
          )}

          <Divider margin='16px' />

          {/* 异常用量 */}
          <div className='flex items-center justify-between mb-2'>
            <div>
              <Text strong>{t('用户异常用量告警')}</Text>
              <Text type='tertiary' size='small' className='block'>{t('单用户5分钟内消耗超过阈值时发邮件（防盗刷）')}</Text>
            </div>
            <Switch checked={cfg.abnormal_usage_enabled} onChange={(v) => set('abnormal_usage_enabled', v)} disabled={!cfg.enabled} />
          </div>
          {cfg.abnormal_usage_enabled && (
            <div className='flex items-center gap-2 mb-4'>
              <Text type='tertiary' size='small'>{t('阈值（美元）')}：</Text>
              <InputNumber
                min={0} step={1} precision={2}
                value={cfg.abnormal_usage_threshold / QUOTA_PER_UNIT}
                onChange={(v) => set('abnormal_usage_threshold', Math.round((v || 0) * QUOTA_PER_UNIT))}
                prefix='$' style={{ width: 160 }}
                disabled={!cfg.enabled}
              />
            </div>
          )}

          <Divider margin='12px' />

          {/* 余额暴增 */}
          <div className='flex items-center justify-between mb-2'>
            <div>
              <Text strong>{t('余额暴增告警')}</Text>
              <Text type='tertiary' size='small' className='block'>{t('单笔充值超过阈值时发邮件')}</Text>
            </div>
            <Switch checked={cfg.quota_surge_enabled} onChange={(v) => set('quota_surge_enabled', v)} disabled={!cfg.enabled} />
          </div>
          {cfg.quota_surge_enabled && (
            <div className='flex items-center gap-2 mb-4'>
              <Text type='tertiary' size='small'>{t('阈值（美元）')}：</Text>
              <InputNumber
                min={0} step={1} precision={2}
                value={cfg.quota_surge_threshold / QUOTA_PER_UNIT}
                onChange={(v) => set('quota_surge_threshold', Math.round((v || 0) * QUOTA_PER_UNIT))}
                prefix='$' style={{ width: 160 }}
                disabled={!cfg.enabled}
              />
            </div>
          )}

          <Divider margin='12px' />

          {/* 每日报表 */}
          <div className='flex items-center justify-between'>
            <div>
              <Text strong>{t('每日报表邮件')}</Text>
              <Text type='tertiary' size='small' className='block'>{t('每日 00:05 汇总昨日 消费/充值/调用/新增用户 发邮件')}</Text>
            </div>
            <Switch checked={cfg.daily_report_enabled} onChange={(v) => set('daily_report_enabled', v)} disabled={!cfg.enabled} />
          </div>

          <div className='mt-6'>
            <Button theme='solid' type='primary' loading={saving} onClick={save}>
              {t('保存')}
            </Button>
          </div>
        </Card>
      </Spin>
    </div>
  );
}
