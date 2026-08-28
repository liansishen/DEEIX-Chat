---
name: merge-upstream-deploy
description: 合并 DEEIX-Chat 官方上游更新到本 fork，审阅并保留 fork 专属功能，通过 GitHub Actions 完成检查、构建和制品校验，备份 SQLite/配置后更新本地 systemd 部署。触发词：合并上游、上游更新、同步 upstream、升级并部署、CI 构建部署；使用 `/merge-upstream-deploy` 调用。
---

# 合并上游并部署

执行本 skill 时，目标是完成一条可回退的升级链路：上游差异审阅 -> 冲突合并 -> CI 检查和构建 -> 制品校验 -> 数据与配置备份 -> 本地部署 -> 服务验证。

## 项目约束

- 先读取仓库根目录 `AGENTS.md`，以仓库规则为准。
- 本项目禁止在本地编译、构建、打包、类型检查、运行 Go/前端测试或启动开发服务器。构建和测试必须通过 GitHub Actions。
- 本项目禁止浏览器、Playwright、截图和浏览器自动化验证。使用 `curl`、`systemctl`、`journalctl`、`sqlite3` 和 `nginx -t` 做部署后验证。
- 不使用破坏性 Git 操作，不回退或覆盖用户已有的无关修改。
- CI 制品未成功生成、校验或下载前，不切换本地 `current` 软链接。
- 失败时保留旧发布目录、保护标签、备份和失败日志，先修复再继续。

## 当前项目基线

以下是本 fork 已经验证过的约束和部署约定。每次升级仍要以仓库和线上配置的实时内容为准：

- fork：`https://github.com/liansishen/DEEIX-Chat.git`
- 官方上游：`https://github.com/DEEIX-AI/DEEIX-Chat.git`
- 默认分支：`dev`
- 计费模式：`self`、`usage`、`period`、`weekly`；`period` 与 `weekly` 互斥。
- weekly 功能必须继续存在：统一 UTC 周期边界、管理员可设置下一次重置时间、手动重置后顺延 7 天、按实际模型成本结算、免费模型绕过额度、按完成时间结算、删除 usage log 不恢复额度、订阅套餐支持权限组、兑换码支持月/季/年订阅。
- 管理员 weekly 时间输入按管理员账户时区解释，存储和 API 传输使用 UTC；用户订阅页显示下次重置时间到分钟。
- 线上域名：`https://deeix.hepdd.com`。`chat.hepdd.com` 只做 301 跳转。CORS、`public_api_base_url`、`public_web_base_url` 必须保持新域名。
- 公共注册关闭。验证当前接口返回的 `emailRegistrationEnabled` 为 `false`，不要只检查示例配置文件。
- 本地部署使用 SQLite、进程内缓存和本地文件存储；应用由 `deeix-chat.service` 运行。
- 本地发布根目录：`/opt/deeix-chat`；当前软链接：`/opt/deeix-chat/current`；发布目录：`/opt/deeix-chat/releases/<commit>`；配置：`/opt/deeix-chat/config.yaml`；应用端口：`18080`。
- SQLite：`/var/lib/docker/volumes/deeix-chat-app-data/_data/deeix.db`；文件存储：`/var/lib/docker/volumes/deeix-chat-app-storage/_data`。

## 已知上游升级内容

官方 `v0.4.0`/对应开发线包含以下重点。每次同步时先用 `git diff --stat` 和 `git diff --name-status` 确认实际差异，不要假设上游版本内容没有变化：

- Temporary Chats 临时聊天和临时聊天工具循环。
- xAI 视频生成扩展及媒体生成流程改进。
- Agent 轨迹、reasoning、工具步骤和结构化工具卡片重构。
- MCP 工具按次计费、工具价格管理和用量快照。
- 模型上下文窗口、上下文预算和自动压缩改进。
- 文件提取、文件处理队列、知识库和预览流程优化。
- 会话提交、分支、流式响应、截图和前端聊天 hooks 大规模重构。
- 优雅关闭、运行时配置、缓存维护和稳定性改进。
- API contract、Swagger 文档、前端依赖和构建流程更新。

合并后必须同时保证这些上游能力和本 fork 的 weekly、时区、域名、关闭注册及 SQLite 部署约束。

## 合并流程

### 1. 预检查和保护

1. 检查 `git status --short --branch`，工作树有用户未提交修改时先停止并说明，不擅自覆盖。
2. 确认当前分支为 `dev`，确认 `origin` 指向 fork。
3. 添加上游 remote（不存在时）并获取目标分支：

```bash
git remote -v
git remote add upstream https://github.com/DEEIX-AI/DEEIX-Chat.git  # 仅在不存在时执行
git fetch upstream dev --tags
```

4. 记录当前提交，创建保护标签，例如：

```bash
git tag pre-upstream-<date>-<commit>
```

5. 审阅提交关系和差异：

```bash
git log --oneline --decorate --graph --all -30
git merge-base HEAD upstream/dev
git rev-list --left-right --count HEAD...upstream/dev
git diff --stat HEAD..upstream/dev
git diff --name-status HEAD..upstream/dev
```

### 2. 合并和冲突审阅

使用非快进合并保留清晰的合并节点：

```bash
git merge --no-ff --no-edit upstream/dev
```

重点审阅这些边界；上游重构后路径可能变化，应按符号和导入搜索：

- `backend/internal/application/billing/`
- `backend/internal/domain/billing/`
- `backend/internal/infra/persistence/models/billing.go`
- `backend/internal/infra/persistence/postgres/billing/`
- `backend/internal/application/conversation/`
- `backend/internal/transport/http/billing/` 和 `conversation/`
- `backend/internal/infra/config/`
- `backend/internal/shared/response/`
- `.github/workflows/deployment-artifact.yml`
- `frontend/features/admin/components/sections/billing/`
- `frontend/features/settings/components/sections/subscription/`
- `frontend/shared/lib/time-zone.ts`
- `frontend/features/settings/model/subscription-format.ts`
- `frontend/i18n/messages/*/admin-billing.json`
- `packages/api-contract/src/types.generated.ts`

检查以下关键符号仍存在且调用链完整：

```bash
grep -RInE 'WeeklyCredit|WeeklyQuota|weeklyNextResetAt|NextResetAt|weeklyUsageCutoff|formatShortDateTime|formatDateTimeLocalInTimeZone|parseDateTimeLocalInTimeZone' backend frontend
git diff --name-only --diff-filter=U
git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- ':!*.lock' || true
```

解决冲突时：

- 保留上游新的领域能力、API、数据迁移和前端流程。
- 将 fork 的 weekly 授权、预留、结算、周期调度、管理员时区输入和用户分钟显示重新接入上游的新调用链。
- 保留 MCP 成本快照与 weekly 实际模型成本结算的独立语义；免费模型不能错误地豁免独立 MCP 服务项。
- LLM 类型优先依赖 `internal/ports/llm`，应用层不得新增 `internal/infra/llm` 业务适配器依赖。
- 统一错误码白名单必须包含 weekly 额度错误，避免流式错误被泛化为 `payment required`。
- 冲突解决后逐个 `git add`，再确认没有未解决文件。

### 3. 允许的本地静态检查

只运行不触发编译的检查：

```bash
gofmt -w <本次修改的 Go 文件>
git diff --check
git diff --cached --check
git status --short --branch
```

不要在本地运行 `go test`、`go build`、`go vet`、`pnpm test`、`pnpm build`、`pnpm check`、TypeScript 检查、Next.js 开发服务器或 Docker 构建。

提交并推送：

```bash
git commit -m "merge: sync upstream updates"
git push origin dev
```

### 4. GitHub Actions 验证

推送后等待 `Workspace Quality`。随后手动启动部署制品工作流：

```bash
gh workflow run 'Deployment Artifact' --repo liansishen/DEEIX-Chat --ref dev
gh run list --repo liansishen/DEEIX-Chat --branch dev --limit 10
```

必须等待并检查：

- `Workspace Quality`：前后端质量检查和完整测试通过。
- `Deployment Artifact`：API contract、PostgreSQL weekly 并发测试、weekly 授权回归、完整后端测试、前端静态构建、Linux amd64 二进制构建和制品上传全部通过。
- `CodeQL Advanced` 和 `GHCR Image` 若由推送触发，也检查结果。
- `Docker Hub Image` 若仅因 fork 缺少 `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` 失败，记录为环境限制，不替代 Deployment Artifact 结果。

查看失败原因：

```bash
gh run view <run-id> --repo liansishen/DEEIX-Chat --log-failed
```

任何编译、类型检查或测试失败都要回到代码修复、提交、推送并重新运行 CI；不能以本地猜测替代 CI 结果。

### 5. 下载和校验制品

只使用成功的 `Deployment Artifact` run：

```bash
mkdir -p /tmp/deeix-chat-artifact-<commit>
gh run download <run-id> --repo liansishen/DEEIX-Chat --dir /tmp/deeix-chat-artifact-<commit>
cd /tmp/deeix-chat-artifact-<commit>/deeix-chat-linux-amd64-<sha>
sha256sum -c SHA256SUMS
grep -Fx 'commit=<full-commit>' BUILD-MANIFEST
grep -Fx 'workflow_run=<run-id>' BUILD-MANIFEST
```

SHA256、`BUILD-MANIFEST` 或版本不匹配时停止部署。

### 6. 备份和更新本地部署

先检查旧服务健康状态和当前发布目录。为每次升级创建唯一备份目录，例如 `/opt/deeix-chat/backups/pre-<commit>`：

```bash
install -d -m 0750 /opt/deeix-chat/backups/pre-<commit>
sqlite3 /var/lib/docker/volumes/deeix-chat-app-data/_data/deeix.db ".backup '/opt/deeix-chat/backups/pre-<commit>/deeix.db'"
install -m 0640 -o root -g deeix-chat /opt/deeix-chat/config.yaml /opt/deeix-chat/backups/pre-<commit>/config.yaml
install -m 0644 /etc/nginx/conf.d/chat.hepdd.com.conf /opt/deeix-chat/backups/pre-<commit>/chat.hepdd.com.conf
sqlite3 /opt/deeix-chat/backups/pre-<commit>/deeix.db 'PRAGMA quick_check;'
```

安装制品到新目录，不复制示例配置覆盖线上配置：

```bash
install -d -m 0755 /opt/deeix-chat/releases/<full-commit>
cp -a /tmp/deeix-chat-artifact-<commit>/deeix-chat-linux-amd64-<sha>/. /opt/deeix-chat/releases/<full-commit>/
chown -R root:root /opt/deeix-chat/releases/<full-commit>
chmod 0755 /opt/deeix-chat/releases/<full-commit> /opt/deeix-chat/releases/<full-commit>/deeix-chat
```

切换时保留旧发布目录，使用临时软链接和 `mv -Tf` 原子替换：

```bash
systemctl stop deeix-chat.service
ln -s /opt/deeix-chat/releases/<full-commit> /opt/deeix-chat/current.next
mv -Tf /opt/deeix-chat/current.next /opt/deeix-chat/current
systemctl start deeix-chat.service
```

启动失败时立即把 `current` 指回旧发布目录并重新启动服务。不要删除旧发布目录，直到新版本稳定运行并完成验证。

### 7. 部署后验证

验证本地服务、公网反代、数据库和关键配置：

```bash
systemctl show deeix-chat.service -p ActiveState -p SubState -p MainPID -p NRestarts -p ExecMainStatus
curl -fsS http://127.0.0.1:18080/healthz
curl -fsS http://127.0.0.1:18080/readyz
curl -fsS https://deeix.hepdd.com/healthz
curl -fsS https://deeix.hepdd.com/readyz
curl -fsS https://deeix.hepdd.com/api/v1/auth/login-options
curl -sS -D - -o /dev/null -H 'Origin: https://deeix.hepdd.com' https://deeix.hepdd.com/healthz
curl -sS -D - -o /dev/null https://chat.hepdd.com/healthz
sqlite3 /var/lib/docker/volumes/deeix-chat-app-data/_data/deeix.db 'PRAGMA quick_check;'
nginx -t
journalctl -u deeix-chat.service --since '10 minutes ago' --no-pager -n 120
```

必须确认：

- `/healthz` 和 `/readyz` 返回 200，版本为新版本。
- `deeix-chat.service` 为 `active/running`，`NRestarts=0`，退出状态为 0。
- CORS 返回 `https://deeix.hepdd.com`。
- 旧域名返回 301 到 `https://deeix.hepdd.com`。
- `/api/v1/auth/login-options` 返回 `emailRegistrationEnabled: false`，并返回以 `https://deeix.hepdd.com` 开头的认证回调基址。旧的 `/api/v1/auth/providers` 集合路径在当前上游路由中可能返回 404，不要把它当作登录配置接口。
- SQLite `PRAGMA quick_check` 返回 `ok`；weekly 表 `billing_quota_schedules`、`billing_quota_cycles`、`billing_weekly_quota_accounts` 存在；管理员设置的 `next_reset_at` 没有被迁移成“订阅日期加 7 天”。
- nginx 配置有效，近期 systemd 日志没有持续启动错误。

完成后报告：上游提交和合并提交、冲突处理、CI run ID 和结果、制品校验、备份目录、当前发布目录、服务和接口验证结果，以及任何未通过但不阻断部署的外部工作流。
