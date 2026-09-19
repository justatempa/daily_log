# Quick Log 桌面小工具

一个贴在桌面的轻量记录工具：输入框 + 发送按钮，回车即发，调用项目的 `POST /api/open/log` 接口添加日志。

## 使用

1. **先在 Web 端生成 API Token**
   - 打开 Daily Log 网页，右上角用户菜单里找「生成 API Token」（调用的是 `user.generateApiToken`）
   - 复制生成的 token

2. **启动小工具**
   - 双击 `启动.bat`（或直接 `python quick_logger.py`）
   - 首次启动会自动弹出设置窗口，填入：
     - API 地址：默认 `http://localhost:3000/api/open/log`（如果部署在别的机器，改成对应地址）
     - Token：粘贴上一步复制的 secretKey
   - 点「保存」

3. **记录**
   - 在输入框打字，回车发送（Shift+回车换行）
   - 发送成功按钮变绿、自动清空；失败变红显示错误
   - 窗口置顶、无边框，按住顶部条可以拖到任意位置
   - 右上角 ⚙ 改配置，✕ 关闭

## 文件

- `quick_logger.py` — 主程序（纯标准库，无第三方依赖）
- `config.json` — 首次保存配置后自动生成
- `启动.bat` — 用 pythonw 无控制台启动

## 可选：打包成 exe

想双击 exe 直接跑、不依赖 Python：

```
pip install pyinstaller
pyinstaller --onefile --windowed --name QuickLog quick_logger.py
```

生成的 exe 在 `dist/` 目录。注意 exe 运行时 `config.json` 会保存在 exe 同目录。
