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

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';

export const useUsersData = () => {
  const { t } = useTranslation();
  const [compactMode, setCompactMode] = useTableCompactMode('users');

  // State management
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [searching, setSearching] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [flaggedOnly, setFlaggedOnly] = useState(false); // 只看疑似邀请滥用

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState({
    id: undefined,
  });

  // Form initial values
  const formInitValues = {
    searchKeyword: '',
    searchGroup: '',
  };

  // Form API reference
  const [formApi, setFormApi] = useState(null);

  // Get form values helper function
  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    return {
      searchKeyword: formValues.searchKeyword || '',
      searchGroup: formValues.searchGroup || '',
    };
  };

  // Set user format with key field
  const setUserFormat = (users) => {
    for (let i = 0; i < users.length; i++) {
      users[i].key = users[i].id;
    }
    setUsers(users);
  };

  // Load users data
  const loadUsers = async (startIdx, pageSize, flaggedOverride = null) => {
    setLoading(true);
    const useFlagged = flaggedOverride === null ? flaggedOnly : flaggedOverride;
    const flaggedParam = useFlagged ? '&flagged_only=true' : '';
    const res = await API.get(
      `/api/user/?p=${startIdx}&page_size=${pageSize}${flaggedParam}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // Search users with keyword and group
  const searchUsers = async (
    startIdx,
    pageSize,
    searchKeyword = null,
    searchGroup = null,
  ) => {
    // If no parameters passed, get values from form
    if (searchKeyword === null || searchGroup === null) {
      const formValues = getFormValues();
      searchKeyword = formValues.searchKeyword;
      searchGroup = formValues.searchGroup;
    }

    if (searchKeyword === '' && searchGroup === '') {
      // If keyword is blank, load files instead
      await loadUsers(startIdx, pageSize);
      return;
    }
    setSearching(true);
    const res = await API.get(
      `/api/user/search?keyword=${searchKeyword}&group=${searchGroup}&p=${startIdx}&page_size=${pageSize}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  // Manage user operations (promote, demote, enable, disable, delete)
  const manageUser = async (userId, action, record) => {
    // Trigger loading state to force table re-render
    setLoading(true);

    const res = await API.post('/api/user/manage', {
      id: userId,
      action,
    });

    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      const user = res.data.data;

      // Create a new array and new object to ensure React detects changes
      const newUsers = users.map((u) => {
        if (u.id === userId) {
          if (action === 'delete') {
            return { ...u, DeletedAt: new Date() };
          }
          return { ...u, status: user.status, role: user.role };
        }
        return u;
      });

      setUsers(newUsers);
    } else {
      showError(message);
    }

    setLoading(false);
  };

  const resetUserPasskey = async (user) => {
    if (!user) {
      return;
    }
    try {
      const res = await API.delete(`/api/user/${user.id}/reset_passkey`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('Passkey 已重置'));
      } else {
        showError(message || t('操作失败，请重试'));
      }
    } catch (error) {
      showError(t('操作失败，请重试'));
    }
  };

  const resetUserTwoFA = async (user) => {
    if (!user) {
      return;
    }
    try {
      const res = await API.delete(`/api/user/${user.id}/2fa`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('二步验证已重置'));
      } else {
        showError(message || t('操作失败，请重试'));
      }
    } catch (error) {
      showError(t('操作失败，请重试'));
    }
  };

  const toggleTopup = async (user) => {
    const action = user.allow_topup === false ? 'allow_topup' : 'disallow_topup';
    const res = await API.post('/api/user/manage', { id: user.id, action });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, allow_topup: action === 'allow_topup' } : u,
        ),
      );
    } else {
      showError(message);
    }
  };

  const setTopupDiscount = async (userId, discount) => {
    const res = await API.post('/api/user/manage', {
      id: userId,
      action: 'set_topup_discount',
      discount_value: discount,
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, topup_discount: discount } : u,
        ),
      );
      return true;
    }
    showError(message);
    return false;
  };

  const batchToggleTopup = async (selectedIds, allowTopup) => {
    const res = await API.post('/api/user/manage/batch_topup', {
      ids: selectedIds,
      allow_topup: allowTopup,
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      setUsers((prev) =>
        prev.map((u) =>
          selectedIds.includes(u.id) ? { ...u, allow_topup: allowTopup } : u,
        ),
      );
    } else {
      showError(message);
    }
  };

  const batchSetGroup = async (selectedIds, group) => {
    const res = await API.post('/api/user/manage/batch_group', {
      ids: selectedIds,
      group,
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      setUsers((prev) =>
        prev.map((u) =>
          selectedIds.includes(u.id) ? { ...u, group } : u,
        ),
      );
    } else {
      showError(message);
    }
  };

  const batchManageQuota = async (selectedIds, mode, value) => {
    const res = await API.post('/api/user/manage/batch_quota', {
      ids: selectedIds,
      mode,
      value,
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      await refresh();
    } else {
      showError(message);
    }
  };

  const batchManageUser = async (selectedIds, action) => {
    const res = await API.post('/api/user/manage/batch_action', {
      ids: selectedIds,
      action,
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      await refresh();
    } else {
      showError(message);
    }
  };

  const batchSetVisibleGroups = async (selectedIds, groups) => {
    const res = await API.post('/api/user/manage/batch_visible_groups', {
      ids: selectedIds,
      groups: groups || [],
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      await refresh();
    } else {
      showError(message);
    }
  };

  // Handle page change
  const handlePageChange = (page) => {
    setActivePage(page);
    const { searchKeyword, searchGroup } = getFormValues();
    if (searchKeyword === '' && searchGroup === '') {
      loadUsers(page, pageSize).then();
    } else {
      searchUsers(page, pageSize, searchKeyword, searchGroup).then();
    }
  };

  // Handle page size change
  const handlePageSizeChange = async (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    loadUsers(activePage, size)
      .then()
      .catch((reason) => {
        showError(reason);
      });
  };

  // Handle table row styling for disabled/deleted users
  const handleRow = (record, index) => {
    if (record.DeletedAt !== null || record.status !== 1) {
      return {
        style: {
          background: 'var(--semi-color-disabled-border)',
        },
      };
    } else {
      return {};
    }
  };

  // Refresh data
  const refresh = async (page = activePage) => {
    const { searchKeyword, searchGroup } = getFormValues();
    if (searchKeyword === '' && searchGroup === '') {
      await loadUsers(page, pageSize);
    } else {
      await searchUsers(page, pageSize, searchKeyword, searchGroup);
    }
  };

  // Fetch groups data
  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      if (res === undefined) {
        return;
      }
      setGroupOptions(
        res.data.data.map((group) => ({
          label: group,
          value: group,
        })),
      );
    } catch (error) {
      showError(error.message);
    }
  };

  // Modal control functions
  const closeAddUser = () => {
    setShowAddUser(false);
  };

  const closeEditUser = () => {
    setShowEditUser(false);
    setEditingUser({
      id: undefined,
    });
  };

  // Initialize data on component mount
  useEffect(() => {
    loadUsers(0, pageSize)
      .then()
      .catch((reason) => {
        showError(reason);
      });
    fetchGroups().then();
  }, []);

  return {
    // Data state
    users,
    loading,
    activePage,
    pageSize,
    userCount,
    searching,
    groupOptions,
    flaggedOnly,
    setFlaggedOnly,

    // Modal state
    showAddUser,
    showEditUser,
    editingUser,
    setShowAddUser,
    setShowEditUser,
    setEditingUser,

    // Form state
    formInitValues,
    formApi,
    setFormApi,

    // UI state
    compactMode,
    setCompactMode,

    // Actions
    loadUsers,
    searchUsers,
    manageUser,
    toggleTopup,
    setTopupDiscount,
    batchToggleTopup,
    batchSetGroup,
    batchManageQuota,
    batchManageUser,
    batchSetVisibleGroups,
    resetUserPasskey,
    resetUserTwoFA,
    handlePageChange,
    handlePageSizeChange,
    handleRow,
    refresh,
    closeAddUser,
    closeEditUser,
    getFormValues,

    // Translation
    t,
  };
};
