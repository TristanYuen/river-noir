# 构建与部署

## 环境要求

- Node.js 22 或更新的 LTS 版本。
- npm 11.12.1 或兼容版本。

## 本地运行

```bash
npm install
npm run dev
```

访问终端输出的本地地址。

## 生产构建

```bash
npm run verify
```

静态产物位于 `apps/web/dist`。

## 联机环境变量

复制 `.env.example` 为 `.env.production`，填写：

```text
VITE_WS_URL=wss://your-domain.example/ws
```

不要在 `VITE_` 环境变量中放置密码、API 密钥或服务器秘密。所有 `VITE_` 值都会进入浏览器产物。

## 静态平台

`vite.config.ts` 使用相对资源路径，因此可以部署到：

- GitHub Pages。
- Cloudflare Pages。
- Vercel。
- Netlify。
- Nginx 或任意静态文件服务器。

所有平台的构建命令为 `npm run build`，输出目录为 `apps/web/dist`。
