package main

import (
    "embed"
    "fmt"
    "io/fs"
    "log"
    "net"
    "net/http"
    "os/exec"
    "runtime"
)

//go:embed web/*
var web embed.FS

func openBrowser(url string) {
    switch runtime.GOOS {
    case "windows":
        _ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
    case "darwin":
        _ = exec.Command("open", url).Start()
    default:
        _ = exec.Command("xdg-open", url).Start()
    }
}

func main() {
    sub, err := fs.Sub(web, "web")
    if err != nil { log.Fatal(err) }
    mux := http.NewServeMux()
    mux.Handle("/", http.FileServer(http.FS(sub)))
    ln, err := net.Listen("tcp", "127.0.0.1:0")
    if err != nil { log.Fatal(err) }
    addr := ln.Addr().String()
    srv := &http.Server{Handler: mux}
    url := "http://" + addr + "/index.html"
    go func() { _ = srv.Serve(ln) }()
    fmt.Println("Life Control running at", url)
    openBrowser(url)
    select {}
}
