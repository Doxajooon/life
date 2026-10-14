using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using Forms = System.Windows.Forms;

namespace JamalLife.Desktop;

/// <summary>
/// Jamal Life for Windows: the web app in a WebView2 window plus what a browser tab can't do —
/// it keeps running in the tray so reminders arrive with the window closed, shows Windows
/// notifications and can start together with Windows.
/// </summary>
public partial class MainWindow : Window
{
    private const string Host = "appassets.jamal-life";
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private readonly Forms.NotifyIcon _tray = new();
    private readonly DispatcherTimer _tick = new() { Interval = TimeSpan.FromSeconds(20) };
    private bool _exiting;
    private bool _trayHintShown;
    private bool _startHidden;

    public MainWindow(bool startHidden)
    {
        InitializeComponent();
        BuildTray();
        _startHidden = startHidden;
        Loaded += async (_, _) =>
        {
            await InitWebView();
            if (_startHidden)
            {
                // Started with Windows (--tray): the page runs, the window stays out of the way.
                _startHidden = false;
                Hide();
                WindowState = WindowState.Normal;
                ShowInTaskbar = true;
            }
        };
        if (startHidden)
        {
            ShowInTaskbar = false;
            WindowState = WindowState.Minimized;
        }
        Closing += OnClosing;
        // Drive the app's reminder scheduler from the host: timers in a hidden window are throttled.
        _tick.Tick += async (_, _) =>
        {
            try { if (Browser.CoreWebView2 != null) await Browser.CoreWebView2.ExecuteScriptAsync("window.__jlTick&&window.__jlTick()"); } catch { }
        };
        _tick.Start();
    }

    private bool _webInit;
    private async System.Threading.Tasks.Task InitWebView()
    {
        if (_webInit) return;
        _webInit = true;
        try
        {
            var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JamalLife", "WebView2");
            var options = new CoreWebView2EnvironmentOptions(
                "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --autoplay-policy=no-user-gesture-required");
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir, options);
            await Browser.EnsureCoreWebView2Async(env);
            var web = Browser.CoreWebView2;
            var webRoot = Path.Combine(AppContext.BaseDirectory, "Web");
            web.SetVirtualHostNameToFolderMapping(Host, webRoot, CoreWebView2HostResourceAccessKind.Allow);
            web.Settings.AreDefaultContextMenusEnabled = true;
            web.Settings.IsStatusBarEnabled = false;
            web.PermissionRequested += (_, a) =>
            {
                if (a.PermissionKind == CoreWebView2PermissionKind.Notifications) a.State = CoreWebView2PermissionState.Allow;
            };
            web.NewWindowRequested += (_, a) => { a.Handled = true; OpenExternal(a.Uri); };
            web.NavigationStarting += (_, a) =>
            {
                if (Uri.TryCreate(a.Uri, UriKind.Absolute, out var u) && u.Host != Host && (u.Scheme == "http" || u.Scheme == "https"))
                {
                    a.Cancel = true;
                    OpenExternal(a.Uri);
                }
            };
            web.WebMessageReceived += OnWebMessage;
            Browser.Source = new Uri($"https://{Host}/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowError("Для работы Jamal Life нужен Microsoft Edge WebView2 Runtime.\nОн уже есть в Windows 10/11; если нет — установите его с сайта Microsoft и перезапустите приложение.");
            OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/");
        }
        catch (Exception ex)
        {
            ShowError("Не удалось запустить Jamal Life: " + ex.Message);
        }
    }

    private void ShowError(string text)
    {
        ErrorText.Text = text;
        ErrorText.Visibility = Visibility.Visible;
        Browser.Visibility = Visibility.Collapsed;
        ShowFromTray();
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type == "notify")
            {
                var title = root.TryGetProperty("title", out var ti) ? ti.GetString() ?? "Jamal Life" : "Jamal Life";
                var body = root.TryGetProperty("body", out var b) ? b.GetString() ?? "" : "";
                _tray.ShowBalloonTip(8000, title, string.IsNullOrWhiteSpace(body) ? " " : body, Forms.ToolTipIcon.None);
                if (!IsVisible || WindowState == WindowState.Minimized) FlashTaskbar();
            }
            else if (type == "autostart")
            {
                SetAutostart(root.TryGetProperty("on", out var on) && on.GetBoolean());
            }
        }
        catch { }
    }

    private void FlashTaskbar()
    {
        try
        {
            var helper = new System.Windows.Interop.WindowInteropHelper(this);
            if (helper.Handle != IntPtr.Zero) FlashWindow(helper.Handle, true);
        }
        catch { }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool FlashWindow(IntPtr hwnd, bool invert);

    private void BuildTray()
    {
        try
        {
            using var stream = Application.GetResourceStream(new Uri("pack://application:,,,/app.ico"))?.Stream;
            if (stream != null) _tray.Icon = new System.Drawing.Icon(stream);
        }
        catch { }
        _tray.Text = "Jamal Life";
        _tray.Visible = true;
        _tray.DoubleClick += (_, _) => ShowFromTray();
        _tray.BalloonTipClicked += (_, _) => ShowFromTray();
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Открыть Jamal Life", null, (_, _) => ShowFromTray());
        var auto = new Forms.ToolStripMenuItem("Запускать вместе с Windows") { Checked = IsAutostart(), CheckOnClick = true };
        auto.CheckedChanged += (_, _) => SetAutostart(auto.Checked);
        menu.Items.Add(auto);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Выход", null, (_, _) => ExitApp());
        _tray.ContextMenuStrip = menu;
    }

    public void ShowFromTray()
    {
        if (!IsVisible) Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
        Topmost = true; Topmost = false;
        Focus();
    }

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (_exiting) return;
        // Closing the window keeps Jamal Life in the tray so reminders keep coming.
        e.Cancel = true;
        Hide();
        if (!_trayHintShown)
        {
            _trayHintShown = true;
            _tray.ShowBalloonTip(5000, "Jamal Life работает в трее", "Напоминания продолжат приходить. Выход — правой кнопкой по значку.", Forms.ToolTipIcon.Info);
        }
    }

    private void ExitApp()
    {
        _exiting = true;
        _tick.Stop();
        _tray.Visible = false;
        _tray.Dispose();
        Application.Current.Shutdown();
    }

    private static bool IsAutostart()
    {
        try { using var k = Registry.CurrentUser.OpenSubKey(RunKey); return k?.GetValue("JamalLife") != null; } catch { return false; }
    }

    private static void SetAutostart(bool on)
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(RunKey, true) ?? Registry.CurrentUser.CreateSubKey(RunKey);
            if (on) k.SetValue("JamalLife", $"\"{Environment.ProcessPath}\" --tray");
            else k.DeleteValue("JamalLife", false);
        }
        catch { }
    }

    private static void OpenExternal(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }
}
