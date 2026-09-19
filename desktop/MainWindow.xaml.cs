using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
namespace LifeControl.Desktop;
public partial class MainWindow : Window
{
    public MainWindow(){InitializeComponent(); Loaded += MainWindow_Loaded;}
    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await Browser.EnsureCoreWebView2Async();
        var webRoot = Path.Combine(AppContext.BaseDirectory, "Web");
        if (Directory.Exists(webRoot))
            Browser.CoreWebView2.SetVirtualHostNameToFolderMapping("appassets.life-control", webRoot, CoreWebView2HostResourceAccessKind.Allow);
        Browser.Source = new Uri("https://appassets.life-control/index.html");
    }
}
