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
import { useSearchParams } from 'react-router-dom';
import { Card, Button, Typography, Avatar, Spin, Empty } from '@douyinfe/semi-ui';
import { KeyRound } from 'lucide-react';
import { API, showError } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export default function OAuthConsent() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request_id');

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // scope → 中文说明
  const scopeText = (s) => {
    switch (s) {
      case 'openid':
        return t('确认你的身份');
      case 'profile':
        return t('读取你的昵称与用户名');
      case 'email':
        return t('读取你的邮箱地址');
      case 'groups':
        return t('读取你所属的分组');
      default:
        return s;
    }
  };

  const load = useCallback(async () => {
    if (!requestId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await API.get(`/api/oauth/consent/${requestId}`);
      if (res?.data?.success) {
        setInfo(res.data.data);
      } else {
        showError(res?.data?.message || t('授权请求无效或已过期'));
      }
    } catch (e) {
      showError(t('授权请求无效或已过期'));
    }
    setLoading(false);
  }, [requestId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (action) => {
    setSubmitting(true);
    try {
      const res = await API.post(`/api/oauth/consent/${requestId}`, { action });
      if (res?.data?.success && res.data.data?.redirect) {
        window.location.href = res.data.data.redirect;
        return;
      }
      showError(res?.data?.message || t('操作失败'));
    } catch (e) {
      showError(t('操作失败'));
    }
    setSubmitting(false);
  };

  return (
    <div className='classic-page-fill flex items-center justify-center'>
      <div className='mt-[60px] w-full max-w-[440px] px-4'>
        <Card className='!rounded-2xl shadow-sm' bodyStyle={{ padding: 28 }}>
          {loading ? (
            <div className='flex justify-center py-10'>
              <Spin size='large' />
            </div>
          ) : !info ? (
            <Empty title={t('授权请求无效或已过期')} description={t('请返回应用重新发起登录')} />
          ) : (
            <>
              <div className='flex flex-col items-center text-center mb-5'>
                {info.client_logo ? (
                  <Avatar src={info.client_logo} size='large' shape='square' style={{ borderRadius: 12 }} />
                ) : (
                  <div
                    className='flex items-center justify-center rounded-xl'
                    style={{ width: 56, height: 56, background: 'var(--semi-color-fill-1)' }}
                  >
                    <KeyRound size={28} style={{ color: 'var(--semi-color-primary)' }} />
                  </div>
                )}
                <Title heading={4} style={{ marginTop: 12, marginBottom: 4 }}>
                  {info.client_name}
                </Title>
                <Text type='tertiary'>{t('请求访问你的账号')}</Text>
              </div>

              <Text strong className='block mb-2'>
                {t('该应用将获得以下权限：')}
              </Text>
              <div className='mb-6'>
                {(info.scopes || []).map((s) => (
                  <div key={s} className='flex items-start gap-2 py-1'>
                    <span style={{ color: 'var(--semi-color-success)' }}>✓</span>
                    <Text>{scopeText(s)}</Text>
                  </div>
                ))}
              </div>

              <div className='flex gap-3'>
                <Button
                  theme='borderless'
                  type='tertiary'
                  block
                  disabled={submitting}
                  onClick={() => decide('deny')}
                >
                  {t('拒绝')}
                </Button>
                <Button
                  theme='solid'
                  type='primary'
                  block
                  loading={submitting}
                  onClick={() => decide('approve')}
                >
                  {t('同意授权')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
