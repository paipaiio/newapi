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

import gsap from 'gsap';

/**
 * GSAP-powered modal animation for Semi Design Modal component
 * Usage: <Modal motion={useModalAnimation()} ... />
 */
export const useModalAnimation = () => {
  return {
    onEnter: (node) => {
      gsap.fromTo(
        node,
        { scale: 0.95, opacity: 0, y: 16 },
        { scale: 1, opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' },
      );
    },
    onExit: (node) => {
      gsap.to(node, { scale: 0.98, opacity: 0, duration: 0.18, ease: 'power2.in' });
    },
  };
};
