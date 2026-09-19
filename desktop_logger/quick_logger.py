"""
Daily Log 桌面快捷记录小工具
- 一个输入框 + 发送按钮，置顶贴桌面
- 调用 POST /api/open/log 添加日志
- 配置保存在同目录 config.json
- 调试日志写在 debug.log
"""

import json
import os
import ssl
import sys
import threading
import traceback
import urllib.request
import urllib.error
from datetime import datetime

import tkinter as tk

BASE_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
LOG_PATH = os.path.join(BASE_DIR, "debug.log")

DEFAULT_CONFIG = {
    "api_url": "http://localhost:3000/api/open/log",
    "token": "",
}


def log(msg):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def load_config():
    if not os.path.exists(CONFIG_PATH):
        return dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {**DEFAULT_CONFIG, **data}
    except Exception as e:
        log(f"load config failed: {e}")
        return dict(DEFAULT_CONFIG)


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


class QuickLogger:
    def __init__(self, root):
        self.root = root
        self.config = load_config()
        self.sending = False
        log(f"started, config: url={self.config.get('api_url')}, token={'set' if self.config.get('token') else 'EMPTY'}")

        root.title("Log")
        root.geometry("420x120")
        root.attributes("-topmost", True)
        root.resizable(False, False)
        root.configure(bg="#f8fafc")
        root.overrideredirect(True)

        # 顶部条
        top = tk.Frame(root, bg="#f8fafc")
        top.pack(fill="x", padx=8, pady=(6, 0))

        title = tk.Label(top, text="Quick Log", bg="#f8fafc", fg="#64748b",
                         font=("Segoe UI", 9))
        title.pack(side="left")

        btn_settings = tk.Button(top, text="⚙", bg="#f8fafc", fg="#94a3b8",
                                 bd=0, font=("Segoe UI", 9), cursor="hand2",
                                 activeforeground="#4f46e5",
                                 command=self.open_settings)
        btn_settings.pack(side="right")

        btn_close = tk.Button(top, text="✕", bg="#f8fafc", fg="#94a3b8",
                              bd=0, font=("Segoe UI", 9), cursor="hand2",
                              activeforeground="#ef4444",
                              command=self.quit)
        btn_close.pack(side="right", padx=(4, 0))

        # 输入框
        self.entry = tk.Text(root, font=("Segoe UI", 11), wrap="word",
                             relief="solid", borderwidth=1, bg="white",
                             fg="#1e293b", insertbackground="#4f46e5",
                             highlightthickness=1, highlightcolor="#6366f1",
                             highlightbackground="#e2e8f0", height=3)
        self.entry.pack(fill="both", expand=True, padx=8, pady=4)

        # 回车发送：用 <KeyPress-Return> 并直接拦截
        self.entry.bind("<KeyPress-Return>", self.on_enter)
        self.entry.focus_set()

        # 底部
        bottom = tk.Frame(root, bg="#f8fafc")
        bottom.pack(fill="x", padx=8, pady=(0, 6))

        self.status = tk.Label(bottom, text="就绪", bg="#f8fafc", fg="#94a3b8",
                               font=("Segoe UI", 8), anchor="w")
        self.status.pack(side="left", fill="x", expand=True)

        self.btn_send = tk.Button(bottom, text="发送", bg="#6366f1", fg="white",
                                  font=("Segoe UI", 9, "bold"), relief="flat",
                                  cursor="hand2", padx=12, pady=2,
                                  activebackground="#4f46e5",
                                  command=self.send)
        self.btn_send.pack(side="right")

        # 拖动窗口
        for w in (top, title):
            w.bind("<Button-1>", self.start_move)
            w.bind("<B1-Motion>", self.on_move)

        if not self.config.get("token"):
            self.root.after(200, self.open_settings)

    def start_move(self, event):
        self._gx = event.x
        self._gy = event.y

    def on_move(self, event):
        x = self.root.winfo_x() + (event.x - self._gx)
        y = self.root.winfo_y() + (event.y - self._gy)
        self.root.geometry(f"+{x}+{y}")

    def open_settings(self):
        win = tk.Toplevel(self.root)
        win.title("设置")
        win.geometry("420x220")
        win.attributes("-topmost", True)
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text="API 地址", font=("Segoe UI", 9)).pack(anchor="w", padx=16, pady=(16, 2))
        e_url = tk.Entry(win, font=("Segoe UI", 10), width=48)
        e_url.pack(padx=16, fill="x")
        e_url.insert(0, self.config.get("api_url", ""))

        tk.Label(win, text="Token (secretKey)", font=("Segoe UI", 9)).pack(anchor="w", padx=16, pady=(10, 2))
        e_token = tk.Entry(win, font=("Segoe UI", 10), width=48)
        e_token.pack(padx=16, fill="x")
        e_token.insert(0, self.config.get("token", ""))

        def save():
            self.config["api_url"] = e_url.get().strip()
            self.config["token"] = e_token.get().strip()
            save_config(self.config)
            log(f"settings saved: url={self.config['api_url']}, token={'set' if self.config['token'] else 'EMPTY'}")
            self.set_status("已保存", "#22c55e")
            win.destroy()
            self.entry.focus_set()

        tk.Button(win, text="保存", bg="#6366f1", fg="white", relief="flat",
                  font=("Segoe UI", 9, "bold"), padx=16, pady=4,
                  command=save).pack(pady=16)
        e_url.focus_set()

    def on_enter(self, event):
        # 有 Shift 键按住时允许换行
        if event.state & 0x0001:
            return
        log("enter pressed")
        self.send()
        return "break"

    def set_status(self, text, color="#94a3b8"):
        self.status.config(text=text, fg=color)

    def set_busy(self, text):
        self.btn_send.config(text=text, bg="#94a3b8", state="disabled")

    def set_idle(self):
        self.btn_send.config(text="发送", bg="#6366f1", state="normal")

    def send(self):
        if self.sending:
            return
        text = self.entry.get("1.0", "end").strip()
        log(f"send called, text={text!r}")
        if not text:
            self.set_status("内容为空", "#f59e0b")
            return
        if not self.config.get("token"):
            self.set_status("请先配置 Token (⚙)", "#ef4444")
            log("no token configured")
            self.open_settings()
            return
        if not self.config.get("api_url"):
            self.set_status("请先配置 API 地址 (⚙)", "#ef4444")
            return

        self.sending = True
        self.set_busy("...")
        self.set_status("发送中...", "#64748b")

        threading.Thread(target=self._do_send, args=(text,), daemon=True).start()

    def _do_send(self, text):
        # 发 UTC 毫秒时间戳，避免时区歧义（服务端 new Date(number) 无歧义）
        now_ms = int(datetime.now().timestamp() * 1000)
        body = json.dumps({
            "content": text,
            "date": now_ms,
        }).encode("utf-8")
        log(f"POST {self.config['api_url']}, date_ms={now_ms}, body={body[:200]}")

        req = urllib.request.Request(
            self.config["api_url"],
            data=body,
            headers={
                "Authorization": f"Bearer {self.config['token']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        # 默认正常 SSL；如果证书验证失败，降级到不验证重试
        contexts = [None, ssl._create_unverified_context()]

        for i, ctx in enumerate(contexts):
            try:
                if i == 1:
                    log("retrying with SSL verification disabled")
                with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
                    log(f"response: {resp.status} {raw}")
                    if resp.status in (200, 201):
                        self.root.after(0, self._on_success)
                        return
                    self.root.after(0, self._on_fail, f"HTTP {resp.status}: {raw[:100]}")
                    return
            except urllib.error.HTTPError as e:
                try:
                    raw = e.read().decode("utf-8", errors="replace")
                except Exception:
                    raw = ""
                log(f"HTTPError {e.code}: {raw}")
                self.root.after(0, self._on_fail, f"HTTP {e.code}: {raw[:100]}")
                return
            except urllib.error.URLError as e:
                reason = str(e.reason)
                if "CERTIFICATE" in reason and i == 0:
                    log("SSL cert verify failed, retrying without verification")
                    continue
                log(f"URLError: {reason}")
                self.root.after(0, self._on_fail, f"连接失败: {reason}")
                return
            except Exception as e:
                log(f"unexpected: {traceback.format_exc()}")
                self.root.after(0, self._on_fail, str(e)[:100])
                return

    def _on_success(self):
        self.sending = False
        self.entry.delete("1.0", "end")
        self.set_idle()
        self.set_status("已发送 ✓", "#22c55e")
        self.entry.focus_set()

    def _on_fail(self, err):
        self.sending = False
        self.set_idle()
        self.btn_send.config(text="重试", bg="#ef4444")
        self.set_status(err, "#ef4444")
        log(f"send failed: {err}")

    def quit(self):
        self.root.destroy()


def main():
    root = tk.Tk()
    QuickLogger(root)
    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log(f"FATAL:\n{traceback.format_exc()}")
        raise
