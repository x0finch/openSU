import type { ReactNode } from 'react';
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import appCss from '../styles.css?url';
import { ButtonLink } from '../ui';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#ffffff' },
      { title: 'openSU · 自建房设计' },
      { name: 'description', content: '描述你想要的房子，得到可以推敲的参数化模型、清爽的轴测图和平面图。' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="tnum text-xs tracking-[0.2em] text-ink-2">404</p>
        <p className="mt-2 text-base">页面不存在 · Page not found</p>
        <ButtonLink variant="link" size="sm" href="/" className="mt-5 text-sm text-ink underline decoration-hairline underline-offset-4">
          openSU
        </ButtonLink>
      </div>
    </main>
  );
}
