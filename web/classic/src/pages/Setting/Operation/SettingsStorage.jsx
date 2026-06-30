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
*/

import React, { useEffect, useState, useRef } from 'react';
import { Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import { API, compareObjects, showError, showSuccess, showWarning } from '../../../helpers';

const DEFAULT = {
  'storage_setting.enabled': false,
  'storage_setting.capture_failed': false,
  'storage_setting.endpoint': '',
  'storage_setting.region': 'auto',
  'storage_setting.bucket': '',
  'storage_setting.access_key': '',
  'storage_setting.secret_key': '',
  'storage_setting.key_prefix': 'conv',
  'storage_setting.retention_days': 0,
  'storage_setting.max_body_bytes': 1048576,
};

export default function SettingsStorage(props) {
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [inputs, setInputs] = useState(DEFAULT);
  const [inputsRow, setInputsRow] = useState(DEFAULT);
  const refForm = useRef();

  useEffect(() => {
    const current = {};
    for (const key of Object.keys(DEFAULT)) {
      if (props.options[key] !== undefined) {
        const v = props.options[key];
        current[key] = typeof DEFAULT[key] === 'boolean'
          ? (v === true || v === 'true')
          : typeof DEFAULT[key] === 'number'
            ? Number(v) || 0
            : v;
      } else {
        current[key] = DEFAULT[key];
      }
    }
    setInputs({ ...DEFAULT, ...current });
    setInputsRow(structuredClone({ ...DEFAULT, ...current }));
    refForm.current?.setValues({ ...DEFAULT, ...current });
  }, [props.options]);

  function onSubmit() {
    const changed = compareObjects(inputs, inputsRow);
    if (!changed.length) return showWarning('你似乎并没有修改什么');
    const queue = changed.map(({ key }) => {
      const v = inputs[key];
      // 密钥字段留空表示不修改
      if ((key === 'storage_setting.access_key' || key === 'storage_setting.secret_key') && !v) {
        return Promise.resolve();
      }
      const value = typeof v === 'boolean' ? String(v) : String(v);
      return API.put('/api/option/', { key, value });
    }).filter(Boolean);
    setLoading(true);
    Promise.all(queue)
      .then(() => { showSuccess('保存成功'); props.refresh(); })
      .catch(() => showError('保存失败，请重试'))
      .finally(() => setLoading(false));
  }

  async function onTest() {
    setTestLoading(true);
    try {
      const res = await API.post('/api/session_log/test_connection');
      const { success, message } = res.data;
      success ? showSuccess(message || '连接成功') : showError(message || '连接失败');
    } catch {
      showError('测试连接失败');
    } finally {
      setTestLoading(false);
    }
  }

  const set = (key) => (v) => setInputs(prev => ({ ...prev, [key]: v }));

  return (
    <Spin spinning={loading}>
      <Form values={inputs} getFormApi={(api) => (refForm.current = api)} style={{ marginBottom: 15 }}>
        <Form.Section text='会话存储 (R2)'>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Switch field='storage_setting.enabled' label='启用会话记录' checkedText='｜' uncheckedText='〇'
                onChange={set('storage_setting.enabled')} />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Switch field='storage_setting.capture_failed' label='记录失败请求' checkedText='｜' uncheckedText='〇'
                onChange={set('storage_setting.capture_failed')} />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Input field='storage_setting.endpoint' label='R2 Endpoint'
                placeholder='https://<accountid>.r2.cloudflarestorage.com'
                onChange={set('storage_setting.endpoint')} />
            </Col>
            <Col xs={24} sm={6}>
              <Form.Input field='storage_setting.region' label='Region'
                placeholder='auto' onChange={set('storage_setting.region')} />
            </Col>
            <Col xs={24} sm={6}>
              <Form.Input field='storage_setting.bucket' label='Bucket 名称'
                onChange={set('storage_setting.bucket')} />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Input field='storage_setting.access_key' label='Access Key ID'
                mode='password' placeholder='留空保留原值'
                onChange={set('storage_setting.access_key')} />
            </Col>
            <Col xs={24} sm={12}>
              <Form.Input field='storage_setting.secret_key' label='Secret Access Key'
                mode='password' placeholder='留空保留原值'
                onChange={set('storage_setting.secret_key')} />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Input field='storage_setting.key_prefix' label='对象 Key 前缀'
                placeholder='conv' onChange={set('storage_setting.key_prefix')} />
            </Col>
            <Col xs={24} sm={8}>
              <Form.InputNumber field='storage_setting.retention_days' label='保留天数 (0=不自动清理)'
                min={0} onChange={set('storage_setting.retention_days')} />
            </Col>
            <Col xs={24} sm={8}>
              <Form.InputNumber field='storage_setting.max_body_bytes' label='单条最大捕获字节'
                min={0} onChange={set('storage_setting.max_body_bytes')} />
            </Col>
          </Row>
          <Row gutter={8}>
            <Col><Button onClick={onSubmit}>保存存储设置</Button></Col>
            <Col>
              <Button loading={testLoading} theme='light' type='tertiary' onClick={onTest}>
                测试连接
              </Button>
            </Col>
          </Row>
        </Form.Section>
      </Form>
    </Spin>
  );
}
