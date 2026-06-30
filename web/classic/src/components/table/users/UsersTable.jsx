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

import React, { useMemo, useState, useRef } from 'react';
import { Empty, Button, Modal, Select, InputNumber, Typography } from '@douyinfe/semi-ui';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import CardTable from '../../common/ui/CardTable';
import { useModalAnimation } from '../../../hooks/common/useModalAnimation';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { getUsersColumns } from './UsersColumnDefs';
import PromoteUserModal from './modals/PromoteUserModal';
import DemoteUserModal from './modals/DemoteUserModal';
import EnableDisableUserModal from './modals/EnableDisableUserModal';
import DeleteUserModal from './modals/DeleteUserModal';
import ResetPasskeyModal from './modals/ResetPasskeyModal';
import ResetTwoFAModal from './modals/ResetTwoFAModal';
import UserSubscriptionsModal from './modals/UserSubscriptionsModal';

gsap.registerPlugin(useGSAP);

const UsersTable = (usersData) => {
  const {
    users,
    loading,
    activePage,
    pageSize,
    userCount,
    compactMode,
    handlePageChange,
    handlePageSizeChange,
    handleRow,
    setEditingUser,
    setShowEditUser,
    manageUser,
    toggleTopup,
    batchToggleTopup,
    batchSetGroup,
    batchManageQuota,
    batchManageUser,
    groupOptions,
    batchSetVisibleGroups,
    refresh,
    resetUserPasskey,
    resetUserTwoFA,
    t,
  } = usersData;

  // Batch selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const batchToolbarRef = useRef(null);
  const modalAnimation = useModalAnimation();

  // 批量工具条滑入动画
  useGSAP(
    () => {
      if (selectedRowKeys.length > 0) {
        gsap.fromTo(
          batchToolbarRef.current,
          { height: 0, opacity: 0, y: -8 },
          { height: 'auto', opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', clearProps: 'transform' },
        );
      }
    },
    { scope: batchToolbarRef, dependencies: [selectedRowKeys.length] },
  );

  // 批量改分组 / 改余额弹窗
  const [showBatchGroup, setShowBatchGroup] = useState(false);
  const [batchGroup, setBatchGroup] = useState('');
  const [showBatchQuota, setShowBatchQuota] = useState(false);
  const [batchQuotaMode, setBatchQuotaMode] = useState('add');
  const [batchQuotaValue, setBatchQuotaValue] = useState(0);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [showBatchVisible, setShowBatchVisible] = useState(false);
  const [batchVisibleGroups, setBatchVisibleGroups] = useState([]);
  // 可见分组弹窗的作用对象（批量=多个selectedRowKeys，单个=[user.id]）
  const [visibleTargetIds, setVisibleTargetIds] = useState([]);
  const [visibleTargetName, setVisibleTargetName] = useState('');

  const QUOTA_PER_UNIT = 500000;

  const doBatchGroup = async () => {
    if (!batchGroup) return;
    await batchSetGroup(selectedRowKeys, batchGroup);
    setShowBatchGroup(false);
    setSelectedRowKeys([]);
    setBatchGroup('');
  };

  const doBatchQuota = async () => {
    // value 单位是美元，转成内部 quota
    const internal = Math.round((batchQuotaValue || 0) * QUOTA_PER_UNIT);
    await batchManageQuota(selectedRowKeys, batchQuotaMode, internal);
    setShowBatchQuota(false);
    setSelectedRowKeys([]);
    setBatchQuotaValue(0);
  };

  // 解析用户当前可见分组白名单（从 record.setting JSON）
  const parseVisibleGroups = (record) => {
    try {
      if (record && record.setting) {
        const st = JSON.parse(record.setting);
        if (Array.isArray(st.visible_groups)) return st.visible_groups;
      }
    } catch (e) {}
    return [];
  };

  // 打开「设置可见分组」弹窗：批量传 ids 数组，单个传 [id] + 预填当前白名单
  const openVisibleModal = (ids, record) => {
    setVisibleTargetIds(ids);
    setVisibleTargetName(record ? (record.username || '') : '');
    setBatchVisibleGroups(record ? parseVisibleGroups(record) : []);
    setShowBatchVisible(true);
  };

  const doBatchVisible = async () => {
    const ids = visibleTargetIds.length > 0 ? visibleTargetIds : selectedRowKeys;
    await batchSetVisibleGroups(ids, batchVisibleGroups);
    setShowBatchVisible(false);
    setVisibleTargetIds([]);
    setVisibleTargetName('');
    setSelectedRowKeys([]);
    setBatchVisibleGroups([]);
  };

  // Modal states
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showDemoteModal, setShowDemoteModal] = useState(false);
  const [showEnableDisableModal, setShowEnableDisableModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [modalUser, setModalUser] = useState(null);
  const [enableDisableAction, setEnableDisableAction] = useState('');
  const [showResetPasskeyModal, setShowResetPasskeyModal] = useState(false);
  const [showResetTwoFAModal, setShowResetTwoFAModal] = useState(false);
  const [showUserSubscriptionsModal, setShowUserSubscriptionsModal] =
    useState(false);

  // Modal handlers
  const showPromoteUserModal = (user) => {
    setModalUser(user);
    setShowPromoteModal(true);
  };

  const showDemoteUserModal = (user) => {
    setModalUser(user);
    setShowDemoteModal(true);
  };

  const showEnableDisableUserModal = (user, action) => {
    setModalUser(user);
    setEnableDisableAction(action);
    setShowEnableDisableModal(true);
  };

  const showDeleteUserModal = (user) => {
    setModalUser(user);
    setShowDeleteModal(true);
  };

  const showResetPasskeyUserModal = (user) => {
    setModalUser(user);
    setShowResetPasskeyModal(true);
  };

  const showResetTwoFAUserModal = (user) => {
    setModalUser(user);
    setShowResetTwoFAModal(true);
  };

  const showUserSubscriptionsUserModal = (user) => {
    setModalUser(user);
    setShowUserSubscriptionsModal(true);
  };

  // Modal confirm handlers
  const handlePromoteConfirm = () => {
    manageUser(modalUser.id, 'promote', modalUser);
    setShowPromoteModal(false);
  };

  const handleDemoteConfirm = () => {
    manageUser(modalUser.id, 'demote', modalUser);
    setShowDemoteModal(false);
  };

  const handleEnableDisableConfirm = () => {
    manageUser(modalUser.id, enableDisableAction, modalUser);
    setShowEnableDisableModal(false);
  };

  const handleResetPasskeyConfirm = async () => {
    await resetUserPasskey(modalUser);
    setShowResetPasskeyModal(false);
  };

  const handleResetTwoFAConfirm = async () => {
    await resetUserTwoFA(modalUser);
    setShowResetTwoFAModal(false);
  };

  // Get all columns
  const columns = useMemo(() => {
    return getUsersColumns({
      t,
      setEditingUser,
      setShowEditUser,
      showPromoteModal: showPromoteUserModal,
      showDemoteModal: showDemoteUserModal,
      showEnableDisableModal: showEnableDisableUserModal,
      showDeleteModal: showDeleteUserModal,
      showResetPasskeyModal: showResetPasskeyUserModal,
      showResetTwoFAModal: showResetTwoFAUserModal,
      showUserSubscriptionsModal: showUserSubscriptionsUserModal,
      toggleTopup,
      manageUser,
      openVisibleModal,
    });
  }, [
    t,
    setEditingUser,
    setShowEditUser,
    showPromoteUserModal,
    showDemoteUserModal,
    showEnableDisableUserModal,
    showDeleteUserModal,
    showResetPasskeyUserModal,
    showResetTwoFAUserModal,
    showUserSubscriptionsUserModal,
    toggleTopup,
    manageUser,
    openVisibleModal,
  ]);

  // Handle compact mode by removing fixed positioning
  const tableColumns = useMemo(() => {
    return compactMode
      ? columns.map((col) => {
          if (col.dataIndex === 'operate') {
            const { fixed, ...rest } = col;
            return rest;
          }
          return col;
        })
      : columns;
  }, [compactMode, columns]);

  return (
    <>
      {selectedRowKeys.length > 0 && (
        <div
          ref={batchToolbarRef}
          className='flex items-center gap-2 mb-2 p-2 rounded-lg bg-[var(--semi-color-fill-0)]'
          style={{ overflow: 'hidden' }}
        >
          <span className='text-sm text-[var(--semi-color-text-1)]'>
            {t('已选')} {selectedRowKeys.length} {t('条')}
          </span>
          <Button
            size='small'
            onClick={() => { batchToggleTopup(selectedRowKeys, true); setSelectedRowKeys([]); }}
          >
            {t('批量开启充值')}
          </Button>
          <Button
            size='small'
            type='danger'
            onClick={() => { batchToggleTopup(selectedRowKeys, false); setSelectedRowKeys([]); }}
          >
            {t('批量禁止充值')}
          </Button>
          <Button
            size='small'
            onClick={() => setShowBatchGroup(true)}
          >
            {t('批量改分组')}
          </Button>
          <Button
            size='small'
            onClick={() => { setBatchQuotaMode('add'); setShowBatchQuota(true); }}
          >
            {t('批量改余额')}
          </Button>
          <Button
            size='small'
            onClick={() => { batchManageUser(selectedRowKeys, 'enable'); setSelectedRowKeys([]); }}
          >
            {t('批量启用')}
          </Button>
          <Button
            size='small'
            type='warning'
            onClick={() => { batchManageUser(selectedRowKeys, 'disable'); setSelectedRowKeys([]); }}
          >
            {t('批量禁用')}
          </Button>
          <Button
            size='small'
            onClick={() => { batchManageUser(selectedRowKeys, 'enable_login'); setSelectedRowKeys([]); }}
          >
            {t('批量允许登录')}
          </Button>
          <Button
            size='small'
            type='warning'
            onClick={() => { batchManageUser(selectedRowKeys, 'disable_login'); setSelectedRowKeys([]); }}
          >
            {t('批量禁止登录')}
          </Button>
          <Button
            size='small'
            onClick={() => openVisibleModal(selectedRowKeys)}
          >
            {t('批量设置可见分组')}
          </Button>
          <Button
            size='small'
            type='danger'
            onClick={() => setShowBatchDelete(true)}
          >
            {t('批量删除')}
          </Button>
          <Button size='small' type='tertiary' onClick={() => setSelectedRowKeys([])}>
            {t('取消选择')}
          </Button>
        </div>
      )}
      <CardTable
        columns={tableColumns}
        dataSource={users}
        scroll={compactMode ? undefined : { x: 'max-content' }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={{
          currentPage: activePage,
          pageSize: pageSize,
          total: userCount,
          pageSizeOpts: [10, 20, 50, 100],
          showSizeChanger: true,
          onPageSizeChange: handlePageSizeChange,
          onPageChange: handlePageChange,
        }}
        hidePagination={true}
        loading={loading}
        onRow={handleRow}
        empty={
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('搜索无结果')}
            style={{ padding: 30 }}
          />
        }
        className='overflow-hidden'
        size='middle'
      />

      {/* Modal components */}
      <PromoteUserModal
        visible={showPromoteModal}
        onCancel={() => setShowPromoteModal(false)}
        onConfirm={handlePromoteConfirm}
        user={modalUser}
        t={t}
      />

      <DemoteUserModal
        visible={showDemoteModal}
        onCancel={() => setShowDemoteModal(false)}
        onConfirm={handleDemoteConfirm}
        user={modalUser}
        t={t}
      />

      <EnableDisableUserModal
        visible={showEnableDisableModal}
        onCancel={() => setShowEnableDisableModal(false)}
        onConfirm={handleEnableDisableConfirm}
        user={modalUser}
        action={enableDisableAction}
        t={t}
      />

      <DeleteUserModal
        visible={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
        user={modalUser}
        users={users}
        activePage={activePage}
        refresh={refresh}
        manageUser={manageUser}
        t={t}
      />

      <ResetPasskeyModal
        visible={showResetPasskeyModal}
        onCancel={() => setShowResetPasskeyModal(false)}
        onConfirm={handleResetPasskeyConfirm}
        user={modalUser}
        t={t}
      />

      <ResetTwoFAModal
        visible={showResetTwoFAModal}
        onCancel={() => setShowResetTwoFAModal(false)}
        onConfirm={handleResetTwoFAConfirm}
        user={modalUser}
        t={t}
      />

      <UserSubscriptionsModal
        visible={showUserSubscriptionsModal}
        onCancel={() => setShowUserSubscriptionsModal(false)}
        user={modalUser}
        t={t}
        onSuccess={() => refresh?.()}
      />

      <Modal
        title={t('批量改分组')}
        visible={showBatchGroup}
        onOk={doBatchGroup}
        onCancel={() => setShowBatchGroup(false)}
        okButtonProps={{ disabled: !batchGroup }}
        motion={modalAnimation}
      >
        <Typography.Text type='tertiary'>
          {t('将选中的')} {selectedRowKeys.length} {t('个用户改为以下分组：')}
        </Typography.Text>
        <Select
          style={{ width: '100%', marginTop: 12 }}
          placeholder={t('选择分组')}
          value={batchGroup}
          onChange={setBatchGroup}
          optionList={(groupOptions || []).map((g) => ({
            label: g.label || g.value || g,
            value: g.value !== undefined ? g.value : g,
          }))}
          filter
        />
      </Modal>

      <Modal
        title={visibleTargetName ? t('设置可见分组') : t('批量设置可见分组')}
        visible={showBatchVisible}
        onOk={doBatchVisible}
        onCancel={() => setShowBatchVisible(false)}
        motion={modalAnimation}
      >
        <Typography.Text type='tertiary'>
          {visibleTargetName
            ? `${t('为用户')} ${visibleTargetName} ${t('设置可见分组（仅影响其能看到的分组，留空=取消限制看到全部）：')}`
            : `${t('为选中的')} ${visibleTargetIds.length || selectedRowKeys.length} ${t('个用户设置可见分组（仅影响其能看到的分组，留空=取消限制看到全部）：')}`}
        </Typography.Text>
        <Select
          multiple
          filter
          style={{ width: '100%', marginTop: 12 }}
          placeholder={t('选择可见分组（可多选，留空恢复默认）')}
          value={batchVisibleGroups}
          onChange={setBatchVisibleGroups}
          optionList={(groupOptions || [])
            .map((g) => ({
              label: g.label || g.value || g,
              value: g.value !== undefined ? g.value : g,
            }))
            .filter((o) => o.value !== 'auto')}
        />
      </Modal>

      <Modal
        title={t('批量改余额')}
        visible={showBatchQuota}
        onOk={doBatchQuota}
        onCancel={() => setShowBatchQuota(false)}
        motion={modalAnimation}
      >
        <Typography.Text type='tertiary'>
          {t('对选中的')} {selectedRowKeys.length} {t('个用户操作余额（单位：美元）')}
        </Typography.Text>
        <Select
          style={{ width: '100%', marginTop: 12 }}
          value={batchQuotaMode}
          onChange={setBatchQuotaMode}
          optionList={[
            { label: t('增加'), value: 'add' },
            { label: t('减少'), value: 'subtract' },
            { label: t('设为(覆盖)'), value: 'override' },
          ]}
        />
        <InputNumber
          style={{ width: '100%', marginTop: 12 }}
          min={0}
          step={1}
          precision={4}
          value={batchQuotaValue}
          onChange={setBatchQuotaValue}
          prefix='$'
          placeholder={t('金额')}
        />
      </Modal>

      <Modal
        title={t('批量删除用户')}
        visible={showBatchDelete}
        onOk={async () => {
          await batchManageUser(selectedRowKeys, 'delete');
          setShowBatchDelete(false);
          setSelectedRowKeys([]);
        }}
        onCancel={() => setShowBatchDelete(false)}
        okText={t('确认删除')}
        okButtonProps={{ type: 'danger' }}
        motion={modalAnimation}
      >
        <Typography.Text type='danger'>
          {t('确定删除选中的')} {selectedRowKeys.length} {t('个用户吗？此操作不可撤销！')}
        </Typography.Text>
      </Modal>
    </>
  );
};

export default UsersTable;
