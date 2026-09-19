// QuickLog - 桌面快捷记录小工具
// 编译: g++ -O2 -s -mwindows -municode -static quick_logger_win.cpp -o QuickLog.exe -lwinhttp -lcomctl32
// 运行: 需要同目录 config.json {"api_url":"https://...","token":"..."}

#include <windows.h>
#include <winhttp.h>
#include <schannel.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <ctime>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "comctl32.lib")

// ---------- 配置 ----------
struct Config {
    std::wstring apiUrl;
    std::wstring token;
};

static std::wstring ExtractJsonString(const std::string& json, const char* key) {
    std::string pattern = std::string("\"") + key + "\"";
    size_t pos = json.find(pattern);
    if (pos == std::string::npos) return L"";
    pos = json.find(':', pos);
    if (pos == std::string::npos) return L"";
    pos = json.find('"', pos);
    if (pos == std::string::npos) return L"";
    size_t end = json.find('"', pos + 1);
    if (end == std::string::npos) return L"";
    std::string val = json.substr(pos + 1, end - pos - 1);
    int len = MultiByteToWideChar(CP_UTF8, 0, val.c_str(), (int)val.size(), NULL, 0);
    std::wstring wval(len, 0);
    MultiByteToWideChar(CP_UTF8, 0, val.c_str(), (int)val.size(), &wval[0], len);
    return wval;
}

static Config LoadConfig() {
    Config cfg;
    wchar_t exePath[MAX_PATH];
    GetModuleFileNameW(NULL, exePath, MAX_PATH);
    std::wstring dir(exePath);
    size_t slash = dir.find_last_of(L"\\/");
    if (slash != std::wstring::npos) dir = dir.substr(0, slash + 1);
    std::wstring cfgPath = dir + L"config.json";

    HANDLE h = CreateFileW(cfgPath.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return cfg;
    DWORD size = GetFileSize(h, NULL);
    std::string content(size, 0);
    ReadFile(h, &content[0], size, &size, NULL);
    CloseHandle(h);

    cfg.apiUrl = ExtractJsonString(content, "api_url");
    cfg.token = ExtractJsonString(content, "token");
    return cfg;
}

// ---------- HTTP POST ----------
static bool HttpPost(const std::wstring& url, const std::wstring& token,
                     const std::string& body, std::string& errOut) {
    URL_COMPONENTSW uc = {sizeof(uc)};
    wchar_t host[256], path[1024];
    uc.lpszHostName = host; uc.dwHostNameLength = _countof(host);
    uc.lpszUrlPath = path;  uc.dwUrlPathLength = _countof(path);
    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &uc)) {
        errOut = "URL parse failed";
        return false;
    }
    bool https = (uc.nScheme == INTERNET_SCHEME_HTTPS);
    INTERNET_PORT port = uc.nPort;

    HINTERNET hSession = WinHttpOpen(L"QuickLog/1.0",
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) { errOut = "WinHttpOpen failed"; return false; }

    HINTERNET hConnect = WinHttpConnect(hSession, host, port, 0);
    if (!hConnect) { errOut = "WinHttpConnect failed"; WinHttpCloseHandle(hSession); return false; }

    DWORD flags = https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path, NULL,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        errOut = "WinHttpOpenRequest failed";
        WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD secFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA |
                     SECURITY_FLAG_IGNORE_CERT_DATE_INVALID |
                     SECURITY_FLAG_IGNORE_CERT_CN_INVALID |
                     SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
    WinHttpSetOption(hRequest, WINHTTP_OPTION_SECURITY_FLAGS, &secFlags, sizeof(secFlags));

    std::wstring headers = L"Content-Type: application/json\r\n";
    headers += L"Authorization: Bearer " + token + L"\r\n";

    BOOL ok = WinHttpSendRequest(hRequest, headers.c_str(), (DWORD)-1L,
        (LPVOID)body.data(), (DWORD)body.size(), (DWORD)body.size(), 0);
    if (!ok) {
        errOut = "SendRequest failed";
        WinHttpCloseHandle(hRequest); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
        return false;
    }

    ok = WinHttpReceiveResponse(hRequest, NULL);
    if (!ok) {
        errOut = "ReceiveResponse failed";
        WinHttpCloseHandle(hRequest); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD statusCode = 0;
    DWORD bufSize = sizeof(statusCode);
    WinHttpQueryHeaders(hRequest,
        WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
        WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &bufSize, WINHTTP_NO_HEADER_INDEX);

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);

    if (statusCode >= 200 && statusCode < 300) return true;
    char buf[64];
    sprintf_s(buf, "HTTP %lu", statusCode);
    errOut = buf;
    return false;
}

// ---------- 控件 ID ----------
#define ID_EDIT     1001
#define ID_BTN      1002
#define ID_STATUS   1003
#define ID_PIN      1004
#define ID_CLOSE    1005

static HWND hMain = NULL;
static HWND hEdit = NULL, hBtn = NULL, hStatus = NULL;
static HWND hPinBtn = NULL, hCloseBtn = NULL;
static WNDPROC origEditProc = NULL;
static Config g_cfg;
static bool g_sending = false;
static bool g_topmost = true;

static void SetStatus(const wchar_t* text) {
    SetWindowTextW(hStatus, text);
}

static void DoSend() {
    if (g_sending) return;

    int len = GetWindowTextLengthW(hEdit);
    if (len == 0) { SetStatus(L"内容为空"); return; }
    std::wstring wtext(len, 0);
    GetWindowTextW(hEdit, &wtext[0], len + 1);

    while (!wtext.empty() && (wtext[0] == L' ' || wtext[0] == L'\n' || wtext[0] == L'\r')) wtext.erase(0, 1);
    while (!wtext.empty() && (wtext.back() == L' ' || wtext.back() == L'\n' || wtext.back() == L'\r')) wtext.pop_back();
    if (wtext.empty()) { SetStatus(L"内容为空"); return; }

    if (g_cfg.apiUrl.empty() || g_cfg.token.empty()) {
        SetStatus(L"请配置 config.json"); return;
    }

    int utf8len = WideCharToMultiByte(CP_UTF8, 0, wtext.c_str(), (int)wtext.size(), NULL, 0, NULL, NULL);
    std::string content(utf8len, 0);
    WideCharToMultiByte(CP_UTF8, 0, wtext.c_str(), (int)wtext.size(), &content[0], utf8len, NULL, NULL);

    // 用 Windows API 明确获取 UTC 毫秒时间戳
    SYSTEMTIME st;
    GetSystemTime(&st);
    FILETIME ft;
    SystemTimeToFileTime(&st, &ft);
    ULARGE_INTEGER uli;
    uli.LowPart = ft.dwLowDateTime;
    uli.HighPart = ft.dwHighDateTime;
    // FILETIME 从 1601-01-01 起，转成 1970-01-01 起的毫秒
    long long nowMs = (long long)((uli.QuadPart - 116444736000000000LL) / 10000);
    std::string escaped;
    for (char c : content) {
        switch (c) {
            case '"': escaped += "\\\""; break;
            case '\\': escaped += "\\\\"; break;
            case '\n': escaped += "\\n"; break;
            case '\r': break;
            case '\t': escaped += "\\t"; break;
            default: escaped += c;
        }
    }
    char body[2048];
    sprintf_s(body, "{\"content\":\"%s\",\"date\":%lld}", escaped.c_str(), nowMs);

    g_sending = true;
    SetWindowTextW(hBtn, L"...");
    SetStatus(L"发送中...");

    struct ThreadArg {
        std::wstring url, token;
        std::string body;
    };
    ThreadArg* arg = new ThreadArg{g_cfg.apiUrl, g_cfg.token, body};

    HANDLE hThread = CreateThread(NULL, 0, [](LPVOID p) -> DWORD {
        ThreadArg* a = (ThreadArg*)p;
        std::string err;
        bool ok = HttpPost(a->url, a->token, a->body, err);

        if (ok) {
            PostMessageW(hMain, WM_USER + 1, 1, 0);
        } else {
            int wlen = MultiByteToWideChar(CP_UTF8, 0, err.c_str(), (int)err.size(), NULL, 0);
            wchar_t* werr = new wchar_t[wlen + 1];
            MultiByteToWideChar(CP_UTF8, 0, err.c_str(), (int)err.size(), werr, wlen + 1);
            werr[wlen] = 0;
            PostMessageW(hMain, WM_USER + 2, 0, (LPARAM)werr);
        }
        delete a;
        return 0;
    }, arg, 0, NULL);
    CloseHandle(hThread);
}

// subclass Edit：拦截回车发送，Shift+回车换行
static LRESULT CALLBACK EditProc(HWND hWnd, UINT msg, WPARAM wp, LPARAM lp) {
    if (msg == WM_KEYDOWN && wp == VK_RETURN) {
        SHORT shift = GetKeyState(VK_SHIFT);
        if (!(shift & 0x8000)) {
            DoSend();
            return 0;
        }
    }
    return CallWindowProcW(origEditProc, hWnd, msg, wp, lp);
}

static void ToggleTopmost() {
    g_topmost = !g_topmost;
    HWND insertAfter = g_topmost ? HWND_TOPMOST : HWND_NOTOPMOST;
    SetWindowPos(hMain, insertAfter, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
    SetWindowTextW(hPinBtn, g_topmost ? L"📌" : L"📌̶");
}

static LRESULT CALLBACK WndProc(HWND hWnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_CREATE: {
        HFONT hFont = CreateFontW(15, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
            DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
        HFONT hFontSm = CreateFontW(13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
            DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");

        // 置顶按钮（右上角）
        hPinBtn = CreateWindowExW(0, L"BUTTON", L"📌",
            WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
            350, 8, 28, 24, hWnd, (HMENU)ID_PIN, NULL, NULL);
        SendMessageW(hPinBtn, WM_SETFONT, (WPARAM)hFontSm, TRUE);

        // 关闭按钮（右上角）
        hCloseBtn = CreateWindowExW(0, L"BUTTON", L"✕",
            WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
            382, 8, 28, 24, hWnd, (HMENU)ID_CLOSE, NULL, NULL);
        SendMessageW(hCloseBtn, WM_SETFONT, (WPARAM)hFontSm, TRUE);

        // 输入框
        hEdit = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"",
            WS_CHILD | WS_VISIBLE | ES_MULTILINE | ES_AUTOVSCROLL | WS_VSCROLL,
            10, 38, 400, 55, hWnd, (HMENU)ID_EDIT, NULL, NULL);
        SendMessageW(hEdit, WM_SETFONT, (WPARAM)hFont, TRUE);

        // subclass Edit 拦截回车
        origEditProc = (WNDPROC)SetWindowLongPtrW(hEdit, GWLP_WNDPROC, (LONG_PTR)EditProc);

        // 发送按钮
        hBtn = CreateWindowExW(0, L"BUTTON", L"发送",
            WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
            320, 98, 90, 28, hWnd, (HMENU)ID_BTN, NULL, NULL);
        SendMessageW(hBtn, WM_SETFONT, (WPARAM)hFont, TRUE);

        // 状态文字
        hStatus = CreateWindowExW(0, L"STATIC", L"就绪",
            WS_CHILD | WS_VISIBLE | SS_LEFT,
            10, 103, 300, 20, hWnd, (HMENU)ID_STATUS, NULL, NULL);
        SendMessageW(hStatus, WM_SETFONT, (WPARAM)hFontSm, TRUE);

        SetFocus(hEdit);
        return 0;
    }
    case WM_COMMAND: {
        WORD id = LOWORD(wp);
        WORD code = HIWORD(wp);
        if (id == ID_BTN && code == BN_CLICKED) {
            DoSend();
        } else if (id == ID_PIN && code == BN_CLICKED) {
            ToggleTopmost();
        } else if (id == ID_CLOSE && code == BN_CLICKED) {
            DestroyWindow(hWnd);
        }
        return 0;
    }
    case WM_USER + 1: {
        g_sending = false;
        SetWindowTextW(hEdit, L"");
        SetWindowTextW(hBtn, L"发送");
        SetStatus(L"已发送 ✓");
        SetFocus(hEdit);
        return 0;
    }
    case WM_USER + 2: {
        g_sending = false;
        wchar_t* werr = (wchar_t*)lp;
        SetWindowTextW(hBtn, L"重试");
        SetStatus(werr);
        delete[] werr;
        SetFocus(hEdit);
        return 0;
    }
    case WM_NCHITTEST: {
        // 点在空白区域（不在子控件上）时允许拖动窗口
        LRESULT result = DefWindowProc(hWnd, msg, wp, lp);
        if (result == HTCLIENT) {
            POINT pt = {LOWORD(lp), HIWORD(lp)};
            ScreenToClient(hWnd, &pt);
            HWND child = ChildWindowFromPointEx(hWnd, pt, CWP_SKIPINVISIBLE);
            if (!child || child == hWnd) {
                return HTCAPTION;
            }
        }
        return result;
    }
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hWnd, msg, wp, lp);
}

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, LPWSTR, int nCmdShow) {
    g_cfg = LoadConfig();

    WNDCLASSW wc = {0};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"QuickLogWnd";
    RegisterClassW(&wc);

    DWORD exStyle = WS_EX_TOPMOST | WS_EX_TOOLWINDOW;
    hMain = CreateWindowExW(exStyle, L"QuickLogWnd", L"QuickLog",
        WS_POPUP | WS_VISIBLE,
        CW_USEDEFAULT, CW_USEDEFAULT, 424, 140,
        NULL, NULL, hInst, NULL);

    RECT rc;
    GetWindowRect(hMain, &rc);
    int x = (GetSystemMetrics(SM_CXSCREEN) - (rc.right - rc.left)) / 2;
    int y = (GetSystemMetrics(SM_CYSCREEN) - (rc.bottom - rc.top)) / 3;
    SetWindowPos(hMain, NULL, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);

    ShowWindow(hMain, nCmdShow);
    UpdateWindow(hMain);

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}
