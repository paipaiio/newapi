import React, { useEffect, useRef } from 'react';

/**
 * Local, React-19-native drop-in replacement for `react-telegram-login`.
 * The upstream package pins react@^16 as a hard dependency, so the bundler
 * ships a second React copy; its element rendered by the app's React 19
 * throws minified error #525 ("A React Element from an older version of
 * React was rendered"), surfaced by the ErrorBoundary as "页面渲染出错".
 * Reimplementing against the app's own React removes the duplicate copy.
 * API kept identical to react-telegram-login so call sites are unchanged.
 */
const TelegramLoginButton = ({
  botName,
  buttonSize = 'large',
  cornerRadius,
  requestAccess = 'write',
  usePic = true,
  dataOnauth,
  dataAuthUrl,
  lang = 'en',
  className,
  children,
}) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !botName) return;

    if (typeof dataOnauth === 'function') {
      window.TelegramLoginWidget = { dataOnauth: (user) => dataOnauth(user) };
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', buttonSize);
    if (cornerRadius !== undefined) {
      script.setAttribute('data-radius', cornerRadius);
    }
    script.setAttribute('data-request-access', requestAccess);
    script.setAttribute('data-userpic', usePic);
    script.setAttribute('data-lang', lang);
    if (dataAuthUrl !== undefined) {
      script.setAttribute('data-auth-url', dataAuthUrl);
    } else {
      script.setAttribute('data-onauth', 'TelegramLoginWidget.dataOnauth(user)');
    }

    container.appendChild(script);

    return () => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [botName, buttonSize, cornerRadius, requestAccess, usePic, dataOnauth, dataAuthUrl, lang]);

  return (
    <div className={className} ref={containerRef}>
      {children}
    </div>
  );
};

export default TelegramLoginButton;
