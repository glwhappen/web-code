# 本地部署与更新说明

这份说明记录当前机器上的 `web-code` 部署方式，方便后续更新或重新部署时直接照做。

## 当前部署方式

- 安装来源：全局 npm 包 `@glwhappen/web-code`
- 启动命令：`web-code`
- 监听端口：`3001`
- 数据库：`/home/happen/.cloudcli/auth.db`
- 托管方式：user systemd service
- 服务文件：`/home/happen/.config/systemd/user/web-code.service`
- 启动脚本：`/home/happen/.local/bin/web-code-supervised`

`web-code-supervised` 会先检查 `3001` 是否已被占用。如果旧进程还在运行，它会等待端口释放；端口空出来后再启动新版 `web-code`。这样可以先完成 npm 升级，再选择合适时间切换服务。

## 查看状态

```bash
web-code version
npm ls -g @glwhappen/web-code --depth=0
systemctl --user status web-code.service --no-pager -l
ss -ltnp | grep ':3001' || true
```

查看日志：

```bash
journalctl --user -u web-code.service -f
```

## 更新到 npm 最新版

先查看 npm 最新版本：

```bash
npm view @glwhappen/web-code version dist-tags --json
```

升级全局包：

```bash
npm install -g @glwhappen/web-code@latest
```

确认全局版本：

```bash
web-code version
npm ls -g @glwhappen/web-code --depth=0
```

注意：如果当前页面仍由旧进程提供服务，设置页可能已经显示新版号，但 Node 服务进程未必已经重启。要完整切到新版，需要让旧进程退出一次。

## 打包后 `web-code` 没有执行权限

如果运行 `web-code` 或 `web-code --help` 时出现类似下面的错误：

```text
/home/happen/.nvm/versions/node/v24.15.0/bin/web-code: Permission denied
```

先检查全局命令实际指向的文件：

```bash
readlink -f "$(command -v web-code)"
ls -l "$(readlink -f "$(command -v web-code)")"
```

正常情况下，目标文件应当包含执行权限，例如 `-rwxrwxr-x`。如果看到的是 `-rw-rw-r--`，说明 bin 入口文件缺少 executable bit，需要补上：

```bash
chmod +x "$(readlink -f "$(command -v web-code)")"
web-code --help
```

原因：`web-code` 这个全局命令是 npm 创建的符号链接，最终指向包内的 `dist-server/server/cli.js`。这个文件虽然有 `#!/usr/bin/env node` shebang，但 shebang 只告诉系统用哪个解释器运行文件，不会自动赋予执行权限。`npm run build` 会删除并重新生成 `dist-server`，TypeScript 编译产物通常会按当前 `umask` 写成普通文件权限，例如 `0644`；如果发布或本地链接时没有再把 `dist-server/server/cli.js` 设为可执行，安装后的 `web-code` 命令就会因为目标文件不可执行而失败。

## 切换到新版进程

如果旧版是通过 `screen -S web-code` 启动的，退出旧进程：

```bash
screen -S web-code -X quit
```

等待 systemd 自动接管：

```bash
sleep 8
systemctl --user status web-code.service --no-pager -l
ss -ltnp | grep ':3001' || true
```

正常结果：

- `screen -ls` 显示没有 `web-code` screen 会话
- `web-code.service` 是 `active (running)`
- `3001` 由 `node .../bin/web-code` 监听

## 如果没有自动起来

手动重启服务：

```bash
systemctl --user restart web-code.service
sleep 8
systemctl --user status web-code.service --no-pager -l
journalctl --user -u web-code.service -n 80 --no-pager
```

## 开机自动启动

当前使用 user systemd service。确认服务已启用：

```bash
systemctl --user is-enabled web-code.service
systemctl --user is-active web-code.service
```

确认用户 linger 已开启，这样机器重启后即使用户未登录也能拉起 user service：

```bash
loginctl show-user happen -p Linger
```

如果显示 `Linger=no`，执行：

```bash
loginctl enable-linger happen
```

## 重新部署时的推荐顺序

1. 执行 `npm install -g @glwhappen/web-code@latest`。
2. 用 `web-code version` 确认新版本。
3. 在可接受短暂断开的时间执行 `screen -S web-code -X quit`。
4. 等待 `web-code.service` 自动接管。
5. 用 `systemctl --user status web-code.service` 和 `ss -ltnp | grep ':3001'` 确认服务恢复。

