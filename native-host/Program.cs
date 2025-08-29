using System;
using System.IO;
using System.Text.Json;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class Program
{
    static void Main()
    {
        while (true)
        {
            var input = ReadMessage();
            if (input == null) break;
            if (input.HasValue && input.Value.TryGetProperty("type", out var typeProp) && typeProp.GetString() == "capture")
            {
                var screenshot = CaptureScreenBase64();
                var overlays = EnumerateWindows();
                var response = new
                {
                    screenshot = screenshot,
                    overlays = overlays
                };
                WriteMessage(JsonSerializer.Serialize(response));
            }
        }
    }

    static JsonElement? ReadMessage()
    {
        var lenBytes = new byte[4];
        if (Console.OpenStandardInput().Read(lenBytes, 0, 4) != 4) return null;
        int len = BitConverter.ToInt32(lenBytes, 0);
        var buffer = new byte[len];
        int read = 0;
        while (read < len)
            read += Console.OpenStandardInput().Read(buffer, read, len - read);
        var json = Encoding.UTF8.GetString(buffer);
        return JsonSerializer.Deserialize<JsonElement>(json);
    }

    static void WriteMessage(string json)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        Console.OpenStandardOutput().Write(BitConverter.GetBytes(bytes.Length), 0, 4);
        Console.OpenStandardOutput().Write(bytes, 0, bytes.Length);
        Console.Out.Flush();
    }

    static string CaptureScreenBase64()
    {
        var bounds = Screen.PrimaryScreen.Bounds;
        using (var bmp = new Bitmap(bounds.Width, bounds.Height))
        {
            using (var g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bmp.Size);
            }
            using (var ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                return Convert.ToBase64String(ms.ToArray());
            }
        }
    }

    static List<object> EnumerateWindows()
    {
        var overlays = new List<object>();
        EnumWindows((hWnd, lParam) =>
        {
            if (IsWindowVisible(hWnd))
            {
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, sb.Capacity);
                var title = sb.ToString();
                if (!string.IsNullOrWhiteSpace(title))
                {
                    overlays.Add(new { title });
                }
            }
            return true;
        }, IntPtr.Zero);
        return overlays;
    }

    // Win32 API
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
}
