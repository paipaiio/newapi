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

import React, { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin(useGSAP);

/**
 * PageTransition 路由切换淡入包裹组件。
 * 每次路由路径变化时，内容以淡入 + 轻微上移的方式出现，避免页面切换的生硬闪烁。
 * 尊重 prefers-reduced-motion：用户偏好减少动效时直接显示，不做动画。
 */
const PageTransition = ({ children }) => {
  const ref = useRef(null);
  const location = useLocation();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          ref.current,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform' },
        );
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [location.pathname] },
  );

  return (
    <div ref={ref} style={{ height: '100%' }}>
      {children}
    </div>
  );
};

export default PageTransition;
