using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Server.Modules.Inbox;
using Xunit;

namespace Multideck.Server.Tests.Modules.Inbox;

public sealed class EmailSafetyTests
{
    [Fact]
    public void SanitizeHtml_PreservesEmailLayoutAndRemovesActiveContent()
    {
        var input = """
            <meta http-equiv="refresh" content="0;https://evil.test">
            <base href="https://evil.test/">
            <table style="border-collapse:collapse;position:fixed;background-image:url(javascript:alert(1))" onclick="steal()">
              <tr><td><a href="javascript:alert(1)" target="_top">Unsafe</a></td></tr>
              <tr><td><a href="https://multideck.app/help">Safe</a></td></tr>
            </table>
            <img src="https://images.example.test/logo.png" onerror="steal()">
            <script>alert(1)</script><iframe src="https://evil.test"></iframe><form><input autofocus></form>
            <svg onload="steal()"><script>alert(2)</script></svg><math href="javascript:alert(3)"></math>
            """;

        var output = EmailSafety.SanitizeHtml(input);

        Assert.Contains("<table", output, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("border-collapse", output, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("https://multideck.app/help", output, StringComparison.Ordinal);
        Assert.Contains("https://images.example.test/logo.png", output, StringComparison.Ordinal);
        Assert.DoesNotContain("<script", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<iframe", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<form", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<svg", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<math", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript:", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onclick", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onerror", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("position:", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("background-image", output, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("text/html")]
    [InlineData("image/svg+xml")]
    [InlineData("application/xml")]
    [InlineData("application/pdf")]
    [InlineData("text/javascript")]
    public void SafeAttachmentMimeType_ForcesActiveFormatsToDownloadOnly(string mimeType)
    {
        Assert.Equal("application/octet-stream", EmailSafety.SafeAttachmentMimeType(mimeType));
    }

    [Theory]
    [InlineData("image/png", "image/png")]
    [InlineData("image/jpeg; charset=binary", "image/jpeg")]
    [InlineData("text/plain; charset=utf-8", "text/plain")]
    [InlineData("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]
    public void SafeAttachmentMimeType_AllowsOnlyExplicitInertFormats(string mimeType, string expected)
    {
        Assert.Equal(expected, EmailSafety.SafeAttachmentMimeType(mimeType));
    }

    [Theory]
    [InlineData("../../invoice.pdf", "invoice.pdf")]
    [InlineData("..\\..\\invoice.pdf", "invoice.pdf")]
    [InlineData("report\r\nInjected.pdf", "report__Injected.pdf")]
    [InlineData("..", "attachment")]
    public void SafeFileName_RemovesPathsAndHeaderControls(string input, string expected)
    {
        Assert.Equal(expected, EmailSafety.SafeFileName(input));
    }

    [Fact]
    public void DescendingThreadCursorPredicate_IsTranslatableByPostgresProvider()
    {
        var options = new DbContextOptionsBuilder<MultideckContext>()
            .UseNpgsql("Host=localhost;Database=translation_only;Username=translation_only;Password=translation_only")
            .Options;
        using var db = new MultideckContext(options);
        var timestamp = DateTime.UtcNow;
        var cursorId = Guid.NewGuid().ToString();

        var sql = db.CommThreads.Where(thread =>
            (thread.CommThreadLastMessageAt ?? thread.CommThreadStartedAt) < timestamp ||
            ((thread.CommThreadLastMessageAt ?? thread.CommThreadStartedAt) == timestamp &&
             string.Compare(thread.CommThreadId.ToString(), cursorId) < 0)).ToQueryString();

        Assert.Contains("CommThread_ID", sql, StringComparison.Ordinal);
    }
}
