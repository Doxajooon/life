using System;
using System.Threading;
using System.Windows;

namespace JamalLife.Desktop;

public partial class App : Application
{
    private Mutex? _single;
    private EventWaitHandle? _showSignal;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // One instance only: a second launch just brings the running window to the front.
        _single = new Mutex(true, "JamalLife.SingleInstance", out bool first);
        _showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, "JamalLife.Show");
        if (!first)
        {
            _showSignal.Set();
            Shutdown();
            return;
        }
        bool startHidden = Array.Exists(e.Args, a => a.Equals("--tray", StringComparison.OrdinalIgnoreCase));
        var window = new MainWindow(startHidden);
        MainWindow = window;
        var listener = new Thread(() =>
        {
            while (_showSignal.WaitOne()) Dispatcher.Invoke(window.ShowFromTray);
        }) { IsBackground = true };
        listener.Start();
        window.Show(); // with --tray it starts minimized and hides itself once the page is loaded
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _single?.Dispose();
        base.OnExit(e);
    }
}
