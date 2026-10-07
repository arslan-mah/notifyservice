using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

namespace WinListener;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static async Task<int> Main(string[] args)
    {
        var pollMs = 1000;
        var dumpOnly = false;
        foreach (var arg in args)
        {
            if (arg.Equals("--dump", StringComparison.OrdinalIgnoreCase))
            {
                dumpOnly = true;
            }
            else if (arg.StartsWith("--poll-ms=", StringComparison.OrdinalIgnoreCase) &&
                int.TryParse(arg["--poll-ms=".Length..], out var parsed) &&
                parsed > 0)
            {
                pollMs = parsed;
            }
        }

        Console.OutputEncoding = Encoding.UTF8;

        if (!Windows.Foundation.Metadata.ApiInformation.IsTypePresent(
                "Windows.UI.Notifications.Management.UserNotificationListener"))
        {
            EmitError("UserNotificationListener API is not available on this Windows version.");
            return 2;
        }

        var listener = UserNotificationListener.Current;
        UserNotificationListenerAccessStatus access;
        try
        {
            access = await listener.RequestAccessAsync();
        }
        catch (Exception ex)
        {
            EmitError($"RequestAccessAsync failed: {ex.Message}");
            return 3;
        }

        if (access != UserNotificationListenerAccessStatus.Allowed)
        {
            EmitError(
                "Notification access denied. Enable access in Windows Settings → Privacy & security → Notifications → Allow access to user notifications, then allow this app.");
            EmitStatus("access_denied", access.ToString());
            return 4;
        }

        if (dumpOnly)
        {
            return await DumpCurrent(listener);
        }

        EmitStatus("listening", access.ToString());

        // Track fingerprint per notification id so Teams-style in-place updates are emitted.
        var seen = new Dictionary<uint, string>();
        try
        {
            var existing = await listener.GetNotificationsAsync(NotificationKinds.Toast);
            foreach (var n in existing)
            {
                var payload = Extract(n);
                seen[n.Id] = Fingerprint(payload);
            }
            EmitStatus("seeded", seen.Count.ToString());
        }
        catch (Exception ex)
        {
            EmitError($"Initial GetNotificationsAsync failed: {ex.Message}");
        }

        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        while (!cts.IsCancellationRequested)
        {
            try
            {
                var notifications = await listener.GetNotificationsAsync(NotificationKinds.Toast);
                var currentIds = new HashSet<uint>();

                foreach (var notification in notifications)
                {
                    currentIds.Add(notification.Id);
                    var payload = Extract(notification);
                    var fp = Fingerprint(payload);

                    if (seen.TryGetValue(notification.Id, out var previousFp) && previousFp == fp)
                    {
                        continue;
                    }

                    seen[notification.Id] = fp;
                    Console.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
                }

                foreach (var id in seen.Keys.ToList())
                {
                    if (!currentIds.Contains(id))
                    {
                        seen.Remove(id);
                    }
                }
            }
            catch (Exception ex)
            {
                EmitError($"Poll failed: {ex.Message}");
            }

            try
            {
                await Task.Delay(pollMs, cts.Token);
            }
            catch (TaskCanceledException)
            {
                break;
            }
        }

        EmitStatus("stopped", "ok");
        return 0;
    }

    private static async Task<int> DumpCurrent(UserNotificationListener listener)
    {
        try
        {
            var notifications = await listener.GetNotificationsAsync(NotificationKinds.Toast);
            EmitStatus("dump", notifications.Count.ToString());
            foreach (var notification in notifications)
            {
                var payload = Extract(notification);
                Console.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
            }
            return 0;
        }
        catch (Exception ex)
        {
            EmitError($"Dump failed: {ex.Message}");
            return 5;
        }
    }

    private static string Fingerprint(object payload)
    {
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        return Convert.ToHexString(hash);
    }

    private static object Extract(UserNotification notification)
    {
        string source = "Unknown App";
        try
        {
            source = notification.AppInfo?.DisplayInfo?.DisplayName ?? source;
        }
        catch
        {
            // Some system notifications may throw on AppInfo access.
        }

        string title = source;
        string message = "";

        try
        {
            var binding = notification.Notification?.Visual?.GetBinding(KnownNotificationBindings.ToastGeneric);
            if (binding != null)
            {
                var texts = binding.GetTextElements();
                if (texts.Count > 0)
                {
                    title = string.IsNullOrWhiteSpace(texts[0].Text) ? source : texts[0].Text;
                    if (texts.Count > 1)
                    {
                        message = string.Join(
                            "\n",
                            texts.Skip(1).Select(t => t.Text).Where(t => !string.IsNullOrWhiteSpace(t)));
                    }
                }
            }
        }
        catch
        {
            // Fall back to source-only payload.
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            message = title;
        }

        string? appId = null;
        try
        {
            appId = notification.AppInfo?.AppUserModelId;
        }
        catch
        {
            // ignore
        }

        return new
        {
            id = notification.Id,
            source,
            title,
            message,
            timestamp = notification.CreationTime.ToUniversalTime().ToString("O"),
            appId,
        };
    }

    private static void EmitError(string message)
    {
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            type = "error",
            message,
        }, JsonOptions));
        Console.Error.WriteLine(message);
    }

    private static void EmitStatus(string status, string detail)
    {
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            type = "status",
            status,
            message = detail,
        }, JsonOptions));
    }
}
