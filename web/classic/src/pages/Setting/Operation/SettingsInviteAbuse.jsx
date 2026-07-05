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

import React, { useEffect, useState, useRef } from 'react';
import { Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import { compareObjects, API, showError, showSuccess, showWarning, toBoolean } from '../../../helpers';
import { useTranslation } from 'react-i18next';

export default function SettingsInviteAbuse(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    'invite_abuse_setting.enabled': false,
    'invite_abuse_setting.max_per_ip': 3,
    'invite_abuse_setting.window_hours': 24,
    'invite_abuse_setting.check_inviter_same_ip': true,
    'invite_abuse_setting.check_email_alias': true,
    'invite_abuse_setting.check_fingerprint': true,
    // 前端用多行文本编辑，提交时转成 JSON 数组
    'invite_abuse_setting.blocked_email_domains': '',
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);

  // 域名列表在后端是 JSON 数组字符串；本地用「一行一个」文本编辑，互转。
  const domainsToText = (val) => {
    if (Array.isArray(val)) return val.join('\n');
    if (typeof val === 'string') {
      const s = val.trim();
      if (s === '') return '';
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.join('\n');
      } catch (e) {
        // 非 JSON（可能是逗号分隔的旧值），原样按行展示
      }
      return s;
    }
    return '';
  };
  const textToDomainsJSON = (text) => {
    const arr = (text || '')
      .split('\n')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d !== '');
    return JSON.stringify(arr);
  };

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else if (item.key === 'invite_abuse_setting.blocked_email_domains') {
        value = textToDomainsJSON(inputs[item.key]);
      } else {
        value = String(inputs[item.key]);
      }
      return API.put('/api/option/', { key: item.key, value });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined)) return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        if (key === 'invite_abuse_setting.blocked_email_domains') {
          currentInputs[key] = domainsToText(props.options[key]);
        } else if (typeof inputs[key] === 'boolean') {
          // 父组件未把点号 key 识别为 bool,值会是字符串 'true'/'false',这里统一转回布尔
          currentInputs[key] = toBoolean(props.options[key]);
        } else if (typeof inputs[key] === 'number') {
          const n = parseInt(props.options[key]);
          currentInputs[key] = isNaN(n) ? inputs[key] : n;
        } else {
          currentInputs[key] = props.options[key];
        }
      }
    }
    setInputs((prev) => ({ ...prev, ...currentInputs }));
    setInputsRow((prev) => structuredClone({ ...prev, ...currentInputs }));
    if (refForm.current) refForm.current.setValues({ ...inputs, ...currentInputs });
  }, [props.options]);

  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('邀请注册滥用检测')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'invite_abuse_setting.enabled'}
                  label={t('开启邀请注册滥用检测')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  extraText={t(
                    '开启后,带邀请码注册若被判定为疑似小号,将不发放邀请返利并在用户列表打标记(不阻断注册)',
                  )}
                  onChange={(value) =>
                    setInputs({ ...inputs, 'invite_abuse_setting.enabled': value })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('同 IP/指纹 注册数上限')}
                  step={1}
                  min={1}
                  extraText={t('时间窗内同一 IP 或指纹注册数达到该值即判定疑似')}
                  field={'invite_abuse_setting.max_per_ip'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'invite_abuse_setting.max_per_ip': parseInt(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('计数时间窗')}
                  step={1}
                  min={1}
                  suffix={t('小时')}
                  field={'invite_abuse_setting.window_hours'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'invite_abuse_setting.window_hours': parseInt(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'invite_abuse_setting.check_inviter_same_ip'}
                  label={t('检测邀请人与被邀请人同 IP')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'invite_abuse_setting.check_inviter_same_ip': value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'invite_abuse_setting.check_email_alias'}
                  label={t('检测邮箱别名/一次性邮箱')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'invite_abuse_setting.check_email_alias': value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'invite_abuse_setting.check_fingerprint'}
                  label={t('检测浏览器指纹')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'invite_abuse_setting.check_fingerprint': value,
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={16}>
                <Form.TextArea
                  label={t('一次性邮箱域名黑名单')}
                  placeholder={t('一行一个域名，例如 mailinator.com')}
                  extraText={t('命中黑名单域名的注册直接判定为疑似滥用')}
                  field={'invite_abuse_setting.blocked_email_domains'}
                  autosize={{ minRows: 4, maxRows: 12 }}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'invite_abuse_setting.blocked_email_domains': value,
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
