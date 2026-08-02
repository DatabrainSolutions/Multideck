using System.Net;
using System.Net.Mail;
using Ganss.Xss;

namespace Multideck.Server.Modules.Inbox;

public static partial class EmailSafety
{
    private static readonly HashSet<string> InertAttachmentMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/gzip", "application/msword", "application/octet-stream", "application/rtf",
        "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/x-7z-compressed", "application/x-rar-compressed", "application/zip",
        "image/gif", "image/jpeg", "image/png", "image/webp", "text/csv", "text/plain",
    };
    private static readonly string[] AllowedEmailTags =
    {
        "a", "abbr", "address", "b", "bdi", "blockquote", "br", "caption", "center", "cite", "code",
        "col", "colgroup", "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure", "font",
        "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol",
        "p", "pre", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "table",
        "tbody", "td", "tfoot", "th", "thead", "tr", "tt", "u", "ul", "var", "wbr",
    };

    private static readonly string[] AllowedEmailAttributes =
    {
        "align", "alt", "bgcolor", "border", "cellpadding", "cellspacing", "colspan", "dir", "height", "href",
        "lang", "rowspan", "src", "style", "title", "valign", "width",
    };

    private static readonly string[] AllowedEmailCssProperties =
    {
        "background-color", "border", "border-bottom", "border-collapse", "border-color", "border-left",
        "border-radius", "border-right", "border-spacing", "border-style", "border-top", "border-width", "color",
        "direction", "display", "font", "font-family", "font-size", "font-style", "font-weight", "height",
        "letter-spacing", "line-height", "margin", "margin-bottom", "margin-left", "margin-right", "margin-top",
        "max-width", "min-width", "padding", "padding-bottom", "padding-left", "padding-right", "padding-top",
        "table-layout", "text-align", "text-decoration", "text-indent", "text-transform", "vertical-align", "white-space",
        "width", "word-break", "word-spacing", "word-wrap",
    };

    public static string SanitizeHtml(string? html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        // A parser-based allow-list preserves ordinary email layout while malformed or deliberately
        // poisoned fragments cannot smuggle active content into the renderer. Remote image URLs
        // remain so the sandboxed client can gate them behind an explicit "Load images" action.
        return CreateEmailSanitizer().Sanitize(html);
    }

    public static string PlainTextToSafeHtml(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var encoded = WebUtility.HtmlEncode(text.Replace("\r\n", "\n", StringComparison.Ordinal));
        return $"<div>{encoded.Replace("\n", "<br>", StringComparison.Ordinal)}</div>";
    }

    public static string? NormalizeEmail(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 320)
        {
            return null;
        }

        try
        {
            var address = new MailAddress(value.Trim());
            return address.Address.ToLowerInvariant();
        }
        catch (FormatException)
        {
            return null;
        }
    }

    public static string SafeFileName(string? fileName)
    {
        var value = string.IsNullOrWhiteSpace(fileName)
            ? "attachment"
            : Path.GetFileName(fileName.Trim().Replace('\\', '/'));
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            value = value.Replace(invalid, '_');
        }
        value = new string(value.Select(character => char.IsControl(character) ? '_' : character).ToArray()).Trim();
        if (value is "" or "." or "..") value = "attachment";
        return value.Length <= 260 ? value : value[..260];
    }

    public static string SafeAttachmentMimeType(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 200 || value.Any(char.IsControl))
        {
            return "application/octet-stream";
        }
        var normalized = value.Split(';', 2)[0].Trim().ToLowerInvariant();
        return InertAttachmentMimeTypes.Contains(normalized) ? normalized : "application/octet-stream";
    }

    private static HtmlSanitizer CreateEmailSanitizer()
    {
        var sanitizer = new HtmlSanitizer();
        sanitizer.AllowedTags.Clear();
        sanitizer.AllowedAttributes.Clear();
        sanitizer.AllowedCssProperties.Clear();
        sanitizer.AllowedAtRules.Clear();
        sanitizer.AllowedSchemes.Clear();
        sanitizer.AllowedTags.UnionWith(AllowedEmailTags);
        sanitizer.AllowedAttributes.UnionWith(AllowedEmailAttributes);
        sanitizer.AllowedCssProperties.UnionWith(AllowedEmailCssProperties);
        sanitizer.AllowedSchemes.UnionWith(["https", "http", "mailto", "cid"]);
        sanitizer.KeepChildNodes = true;
        return sanitizer;
    }
}
