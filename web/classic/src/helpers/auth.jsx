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

import React from 'react';
import { Navigate } from 'react-router-dom';
import { history } from './history';
import PageTransition from '../components/common/PageTransition';

export function authHeader() {
  // return authorization header with jwt token
  let user = JSON.parse(localStorage.getItem('user'));

  if (user && user.token) {
    return { Authorization: 'Bearer ' + user.token };
  } else {
    return {};
  }
}

// 仅允许站内相对路径（且非协议相对 //host），避免开放重定向。
export function safeInternalRedirect(target) {
  return (
    typeof target === 'string' &&
    target.startsWith('/') &&
    !target.startsWith('//')
  );
}

export const AuthRedirect = ({ children }) => {
  const user = localStorage.getItem('user');

  if (user) {
    // 已登录用户若带 redirect（如 OAuth 授权回跳到 /oauth2/authorize 后端端点），
    // 用整页跳转交给后端处理（后端路由非 SPA 路由，不能用 client 端 Navigate）。
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    if (safeInternalRedirect(redirect)) {
      window.location.href = redirect;
      return null;
    }
    return <Navigate to='/console' replace />;
  }

  return children;
};

function PrivateRoute({ children }) {
  if (!localStorage.getItem('user')) {
    return <Navigate to='/login' state={{ from: history.location }} />;
  }
  return <PageTransition>{children}</PageTransition>;
}

export function AdminRoute({ children }) {
  const raw = localStorage.getItem('user');
  if (!raw) {
    return <Navigate to='/login' state={{ from: history.location }} />;
  }
  try {
    const user = JSON.parse(raw);
    if (user && typeof user.role === 'number' && user.role >= 10) {
      return <PageTransition>{children}</PageTransition>;
    }
  } catch (e) {
    // ignore
  }
  return <Navigate to='/forbidden' replace />;
}

export { PrivateRoute };
