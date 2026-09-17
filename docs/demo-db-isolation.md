# apidemo 独立数据库方案

## 最终产品形态

两套完整站点，同一批账号：

| | 生产（稳定） | 预览（新功能） |
|---|---|---|
| 网站 | https://api.tuftech.org | https://apidemo.tuftech.org |
| API | `https://api.tuftech.org/v1` | `https://apidemo.tuftech.org/v1` |
| 登录 | 现有用户名 / 密码 / 2FA | **同一套**（库里拷过去的） |
| API Key | 现有 `sk-` | **同一把**，只换 Base URL |
| 镜像 | 稳定版（现在 `rc65-stripe-toggle`） | 要试用的新版本（现在 `rc66-content-safety-audit`） |
| 系统开关 | 生产 options | demo 自己的 options（可开内容安全、新菜单） |

给指定用户的说明就两句：

1. 网站：打开 apidemo，用现在的账号登录，试用新界面 / 新功能。  
2. API：客户端 Base URL 改成 `https://apidemo.tuftech.org`，Key 不用换。

这不是「只给 API 的灰度」，而是 **网站 + API 一起的预览站**。NewAPI 本来就是前后端同一个进程，拆库之后自然两边都在新镜像上。

---

## 更简单：用户仍走生产 API，apidemo 只给管理员看安全能力

如果觉得让用户改 Base URL / 登录预览站太重，可以改成：

- 用户：网站和 API **继续用** https://api.tuftech.org ，什么都不用改
- 你：用 https://apidemo.tuftech.org 看内容安全设置和工作台

这里必须选一种，不能混：

### 路线 S1 — 只在 apidemo 上试用（推荐先做）

生产继续跑旧镜像。你用自己的测试 Key **打 apidemo**，工作台里只有这些测试事件。

- 用户流量 **不会** 被扫描，工作台也不会出现真实用户的越狱/红线
- 不需要同步用户、不需要 demo 专用模型
- 仍建议 demo 独立库，避免你在预览站改 `options` 写进生产

适合：先验收 UI、策略、403、工作台，再决定要不要上生产。

### 路线 S2 — 工作台要看到真实用户

扫描发生在 **处理 `/v1` 的那个进程**。用户还走 `api.tuftech.org`，就必须把带内容安全的新镜像发到 **生产 API**（总开关默认关）。

然后：

1. 生产默认 `content_safety.enabled=false`，用户无感知
2. 管理员打开 apidemo（或生产后台新页面）看设置和工作台
3. 若 apidemo 和生产 **仍共用一个库**，你在 apidemo 打开总开关 = 生产用户立刻被扫

所以 S2 要么：

- 接受共用库，把 apidemo 当成「同一数据的第二块屏幕」，开开关就是对全网生效；要么
- 生产独立开内容安全，apidemo 只是你先熟悉 UI 的地方（那又回到 S1）

**做不到的：** 用户打生产旧镜像，apidemo 新镜像却能列出那些请求的安全事件——旧进程根本不会写 `content_safety_events`。

---

目标：`apidemo` 与生产不再共用 `new-api` 库和 Redis db0。  
身份（用户、令牌、渠道）从生产单向同步到 demo，开关和日志隔离。

原则：

- 同一台 MySQL 上新建库 `new-api-demo`，**不要整库拷 3.8GB 日志**
- 用户 / 令牌 / 渠道 **从生产单向同步** 到 demo
- **`options`、日志、会话、额度消耗不同步**
- 同步间隔用 **30s**，不要 5s 全库刷

---

## 用户怎么用（网站 + API）

1. 生产照常：https://api.tuftech.org  
2. 受邀试用：打开 https://apidemo.tuftech.org ，用**现有账号密码**登录（要再登一次，cookie 按域名隔离，不会把生产踢下线）  
3. 调用方：Base URL 改为 `https://apidemo.tuftech.org`，`sk-` 不变  
4. 预览站跑新镜像；生产仍留在旧镜像  

同一账号能进行网站，是因为 `users`（含密码哈希、2FA 密钥）从生产拷过来。  
同一把 `sk-` 能调 API，是因为 `tokens` 一起拷过来。

告诉用户的四句话：

- 网站和 API 都在预览站，Key / 账号不用新开  
- 模型和渠道与产线同一套（走真实上游，**渠道账单是真的**）  
- 预览站余额是拷贝，**两边扣费互不影响**  
- 限流独立，RPM 可能比生产更松  

网站侧拷完 options 之后 **必须立刻改**，否则邮件、OAuth、支付回调会打到生产域名：

| 配置 | 生产 | Demo 改成 |
|---|---|---|
| `ServerAddress` | `https://api.tuftech.org` | `https://apidemo.tuftech.org` |
| `SystemName` | TUFTech | 例如 `TUFTech Preview`（让用户一眼看出在预览站） |
| GitHub / OIDC / LinuxDO 回调 | 生产回调 URL | 在 OAuth 应用里 **额外加一条** `https://apidemo.tuftech.org/oauth/...`，或预览站只用密码登录 |
| Passkey | RPID=`api.tuftech.org` | 域名不同，**生产注册的 Passkey 在预览站不可用**，用密码/2FA |
| 支付回调 | 生产 notify URL | 预览站关掉充值，或单独配 apidemo 回调（不要把测试支付写进生产订单表） |

密码登录、令牌登录不依赖这些回调，金丝雀主路径够用。OAuth 要另配，不配就在预览站隐藏第三方登录。

---

## 为什么不要「每 5 秒同步全部用户数据」

| 做法 | 结果 |
|---|---|
| 5s 整库 dump/restore | `session_logs` 2.7GB，做不到，而且会打爆生产 MySQL |
| 5s 覆盖 `options` | demo 里打开的内容安全、blocking、存储前缀会被生产盖掉 |
| 5s 覆盖 `users.quota` / `tokens.remain_quota` | demo 刚扣的额度被生产旧值写回 → **demo 额度几乎无限** |
| 5s 覆盖 `user_sessions` | 控制台登录被踢 |
| 双向同步 | 测试封禁、测试充值写回生产 |

5 秒只对「很小的身份表、单向、不碰额度」有意义。你们现在 `users+tokens+channels` 合计大约 **1MB**，**30 秒** 做一次 `REPLACE` 足够：用户新建 Key 后最多等半分钟就能在 apidemo 用。

若你坚持更近实时，下限用 **15s**，不要低于这个。

---

## 现状

| | 生产 `newapi` | Demo `newapi_demo` |
|---|---|---|
| 容器 | `newapi` `:3000` | `newapi_demo-new-api-1` `:3001` |
| 镜像 | `rc65-stripe-toggle` | `rc66-content-safety-audit` |
| MySQL | `newapi-mysql` / 库 `new-api` | **同一个** |
| Redis | `newapi-redis` db0（约 170 key） | **同一个 db0** |
| `SESSION_SECRET` | 已分开 | `demo_kQ7vN2pX9mL4wR8t` |

`new-api` 大约 **3.8GB / 44 张表 / 539 用户 / 31 渠道**。体积几乎全在日志：

- `session_logs` ~2.7GB
- `logs` ~830MB
- `conversation_groups` ~163MB
- `monitor_samples` ~138MB

这些对 demo 没有测试价值，**不要拷**。

合规站 `newapi_compliance` 是生产 slave，本次不动。

---

## 推荐形态

```
newapi          → MySQL 库 new-api          + Redis /0
newapi_demo     → MySQL 库 new-api-demo     + Redis /1
newapi_compliance 仍指向生产库（slave）
```

- MySQL **继续用现有容器** `newapi-mysql`，只加一个库。3.8GB 已经在这台机器上，再起一个 MySQL 性价比低。
- Redis **继续用现有容器**，demo 改到 **db1**。限流、会话缓存、token 缓存就不会和产线抢。
- 应用账号不要再用 `root` 打 demo 库，单独建 `newapi_demo` 用户，只授权 `new-api-demo.*`。

不推荐：空库冷启动。AutoMigrate 能建表，但没有渠道/模型/分组/管理员，demo 不能打真实请求。

---

## 拷什么 / 不拷什么 / 持续同步什么

首次：全表结构 + 下面「同步」表的全量数据 + `options` 拷一次。  
之后：cron/脚本只同步身份和渠道，**永远单向 production → demo**。

### 持续同步（约每 30s）

| 表 | 原因 |
|---|---|
| `users`（见下方额度列） | 同一账号能登录 / 鉴权 |
| `tokens`（见下方额度列） | 同一把 `sk-` 在 apidemo 可用 |
| `channels` | 模型和上游 Key |
| `abilities` | 渠道×模型绑定 |
| `models` | 模型元数据 |

`users` / `tokens` 建议 **同步身份、不同步钱包**：

- 同步：`id, username, password, role, status, group, email, setting, …`（能鉴权的字段）
- **不要定期覆盖**：`users.quota`、`users.used_quota`、`tokens.remain_quota`、`tokens.used_quota`

实现上：首次 `REPLACE` 整行（含额度快照）；之后 `INSERT ... ON DUPLICATE KEY UPDATE` 列出身份列，**UPDATE 列表里不出现额度列**。

### 只拷一次，之后不同步

- `options`：demo 自己的内容安全 / SSRF / 存储前缀
- 分组倍率等已经在 `options` 里的 JSON，首次一起过来，之后 demo 可改

### 永不拷、永不向 demo 灌

- `session_logs` / `logs` / `conversation_groups`
- `monitor_samples` / `quota_data` / `perf_metrics` / `system_tasks`
- `content_safety_events`
- `user_sessions` / `oauth_*` / `auth_flows`
- `top_ups` / 订阅订单

生产新建的 token，30s 内出现在 demo。生产删除/禁用 token，同样 30s 内 demo 失效。Demo 里新建的测试 token：下次同步 **不会**删掉（`REPLACE` 全表会删，所以持续同步必须用 **按主键 upsert，禁止 truncate**）。

**渠道密钥：** 金丝雀场景就是要和生产同一条上游，**渠道账单是真钱**。内容安全拦截发生在发上游之前，被挡的请求不烧上游；放行的请求和产线一样计渠道成本。

Demo 专用 QA 账号用用户名加前缀 `qa-`，同步脚本删除「生产已不存在的用户」时跳过这个前缀。

**对象存储：** `options` 里的 `storage_setting.*` 会一起过来。拷完立刻改：

- `storage_setting.key_prefix` → `demo-conv`（或直接 `storage_setting.enabled=false`）
- 不要用生产前缀写测试垃圾

---

## 持续同步（建议）

宿主机 systemd timer 或 cron，**只读生产库、只写 demo 库**。

```text
每 30s：
  1. channels, abilities, models
     → REPLACE INTO demo（与生产保持一致，含禁用状态）
  2. tokens
     → upsert 全部列，但 ON DUPLICATE 不更新 remain_quota / used_quota
     → DELETE demo 中生产已删除的 token（保留 token name 以 qa- 开头的）
  3. users
     → upsert 身份列，不更新 quota / used_quota
     → DELETE 生产已删除的用户（保留 username 以 qa- 开头的）
  4. 不要 FLUSH demo Redis 全库；token 缓存 TTL 跟 SYNC_FREQUENCY（默认 60s）
```

单次同步这几张表目前大约 1MB，`mysqldump --single-transaction` 对生产是短一致快照，可以接受。不要对 `logs` / `session_logs` 做同样的事。

伪代码（真正落地时再写成 `/usr/local/sbin/newapi-demo-sync.sh`）：

```bash
# 渠道类：允许整表替换
mysqldump --single-transaction --no-create-info --replace \
  new-api channels abilities models \
  | mysql new-api-demo

# 用户/令牌：用临时表 + INSERT ... ON DUPLICATE KEY UPDATE（额度列不在 UPDATE 列表）
# 再 DELETE demo.tokens WHERE id NOT IN (SELECT id FROM tmp) AND name NOT LIKE 'qa-%'
```

失败只打日志，**禁止**失败时自动改回指向生产库。

---

## 实施步骤（约 15–30 分钟，生产只读）

在宿主机执行。全程 **不要重启生产 `newapi`**。

### 0. 窗口

- 选流量低谷
- 告知：切换瞬间 apidemo 会重启一次，登录态失效（SESSION 本就和产线不同）
- 准备回滚：把 compose 里 DSN 改回去即可

### 1. 建库和专用账号

```bash
docker exec -i newapi-mysql mysql -uroot -p123456 <<'SQL'
CREATE DATABASE IF NOT EXISTS `new-api-demo`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'newapi_demo'@'%' IDENTIFIED BY 'CHANGE_ME_DEMO_DB_PASS';
GRANT ALL PRIVILEGES ON `new-api-demo`.* TO 'newapi_demo'@'%';
FLUSH PRIVILEGES;
SQL
```

把 `CHANGE_ME_DEMO_DB_PASS` 换成独立密码，不要沿用 `123456`。

### 2. 导结构

```bash
docker exec newapi-mysql mysqldump -uroot -p123456 \
  --no-data --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 \
  `new-api` \
  | docker exec -i newapi-mysql mysql -uroot -p123456 --default-character-set=utf8mb4 `new-api-demo`
```

### 3. 导配置数据（排除大日志表）

```bash
INCLUDE_TABLES="
abilities channels models options tokens users
checkins twofas user_oauth_bindings
"

# 按实际表名微调：先 SHOW TABLES 核对
docker exec newapi-mysql mysql -uroot -p123456 -N -e "SHOW TABLES FROM \`new-api\`"
```

确认表名后：

```bash
docker exec newapi-mysql mysqldump -uroot -p123456 \
  --single-transaction --no-create-info --default-character-set=utf8mb4 \
  `new-api` \
  abilities channels models options tokens users \
  | docker exec -i newapi-mysql mysql -uroot -p123456 --default-character-set=utf8mb4 `new-api-demo`
```

如果只要管理员 + 测试号，不要全量 `users`/`tokens`，改成带 `WHERE` 的导出，或导完再 `DELETE`。

### 4. 改 demo compose（只改 demo）

文件：`/www/dk_project/dk_app/newapi/newapi_demo/docker-compose.yml`

```yaml
environment:
  - SQL_DSN=newapi_demo:CHANGE_ME_DEMO_DB_PASS@tcp(newapi-mysql:3306)/new-api-demo?charset=utf8mb4&parseTime=True&loc=Local
  - REDIS_CONN_STRING=redis://:123456@newapi-redis:6379/1
  - SESSION_SECRET=${SESSION_SECRET}
  # 其余保持
```

建议同时把密码放进 `.env`，compose 用 `${DEMO_SQL_DSN}`，避免密码进 git/备份明文。

**不要**给 demo 配生产的 `LOG_SQL_DSN`。日志就写在 `new-api-demo` 里。

### 5. 重启 demo，确认生产没动

```bash
cd /www/dk_project/dk_app/newapi/newapi_demo
docker compose up -d --force-recreate --no-deps new-api

# demo
curl -sS http://127.0.0.1:3001/api/status

# 生产必须仍是旧镜像、旧库
docker inspect newapi --format '{{.Config.Image}}'
docker inspect newapi --format '{{range .Config.Env}}{{println .}}{{end}}' | grep SQL_DSN
```

期望：

- demo 能登录（用拷过去的管理员）
- 生产 `SQL_DSN` 仍是 `/new-api`
- `SHOW DATABASES` 能看到 `new-api` 和 `new-api-demo`

### 6. Demo 侧立刻改的配置（登录控制台）

1. 内容安全：保持关，或只在 demo 开
2. `storage_setting.key_prefix` 改成 `demo-conv`，或关掉会话捕获
3. 不需要的渠道 Disable
4. 新建两个测试用户/令牌专供 QA（见 `docs/content-safety-qa.md`）
5. 确认 Worker / 支付回调 URL 如果指向生产域名，改成 apidemo 或关掉支付

### 7. 验收隔离

| 检查 | 做法 | 期望 |
|---|---|---|
| 库隔离 | demo 改 `SystemName` 或开内容安全 | 生产 options 不变 |
| Redis 隔离 | demo 打满测试分组限流 | 生产同一用户不 429 |
| 用户隔离 | demo 禁用测试用户 B | 生产同名用户仍可用 |
| 日志隔离 | demo 打几条请求 | `new-api-demo.logs` 增长，`new-api.logs` 不因 demo 增长 |

```bash
docker exec newapi-mysql mysql -uroot -p123456 -e "
SELECT COUNT(*) prod_options FROM \`new-api\`.options;
SELECT COUNT(*) demo_options FROM \`new-api-demo\`.options;
SELECT COUNT(*) prod_cs FROM \`new-api\`.content_safety_events;
SELECT COUNT(*) demo_cs FROM \`new-api-demo\`.content_safety_events;
"
```

---

## 回滚

把 demo compose 的 `SQL_DSN` / `REDIS_CONN_STRING` 改回：

```
SQL_DSN=root:123456@tcp(newapi-mysql:3306)/new-api
REDIS_CONN_STRING=redis://:123456@newapi-redis:6379
```

再 `docker compose up -d --force-recreate --no-deps new-api`。  
`new-api-demo` 库可以留着，不影响生产。

---

## 不做的事

- 不 mysqldump 整库（3.8GB，且会把会话正文/密钥日志再存一份）
- 不新建 MySQL 容器（除非后面磁盘/权限要物理隔离）
- 不改生产 `newapi` 的 DSN
- 不把 `newapi_compliance` 指到 demo 库
- 不在切换前打开内容安全 blocking

---

## 后续（可选）

1. 定期从生产 **结构+options+channels** 刷新 demo（脚本化，仍排除日志表）
2. Redis 若也要物理隔离，再给 demo 单独起一个 redis，现在 db1 够用
3. 渠道改为 demo 专用 Key，避免测试烧生产余额
4. MySQL 给生产用户也收权：生产应用不要用 root
