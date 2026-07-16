using System.Text.RegularExpressions;

namespace Multideck.Server.Modules.AgentDexter;

internal static partial class DexterResponseFormatter
{
    public static string ToPlainText(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var lines = value.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var output = new List<string>(lines.Length);

        for (var index = 0; index < lines.Length; index++)
        {
            if (index + 1 < lines.Length && TryReadTableHeader(lines[index], lines[index + 1], out var headers))
            {
                index += 2;
                var rowCount = 0;

                while (index < lines.Length)
                {
                    var cells = ReadCells(lines[index]);
                    if (cells.Count < 2)
                    {
                        index--;
                        break;
                    }

                    if (rowCount > 0)
                    {
                        AddBlankLine(output);
                    }

                    for (var cellIndex = 0; cellIndex < Math.Min(headers.Count, cells.Count); cellIndex++)
                    {
                        var label = CleanInline(headers[cellIndex]);
                        var cellValue = CleanInline(cells[cellIndex]);
                        if (!string.IsNullOrWhiteSpace(label) && !string.IsNullOrWhiteSpace(cellValue))
                        {
                            output.Add($"{label} - {cellValue}");
                        }
                    }

                    rowCount++;
                    index++;
                }

                continue;
            }

            var line = CleanInline(lines[index]);
            if (GenericFollowUpRegex().IsMatch(line) || GenericTableIntroRegex().IsMatch(line))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                AddBlankLine(output);
            }
            else
            {
                output.Add(line);
            }
        }

        while (output.Count > 0 && string.IsNullOrWhiteSpace(output[^1]))
        {
            output.RemoveAt(output.Count - 1);
        }

        return string.Join(Environment.NewLine, output).Trim();
    }

    private static bool TryReadTableHeader(string headerLine, string separatorLine, out IReadOnlyList<string> headers)
    {
        headers = ReadCells(headerLine);
        var separators = ReadCells(separatorLine);
        return headers.Count >= 2 &&
               separators.Count == headers.Count &&
               separators.All(separator => TableSeparatorRegex().IsMatch(separator));
    }

    private static IReadOnlyList<string> ReadCells(string line)
    {
        var trimmed = line.Trim();
        if (!trimmed.Contains('|'))
        {
            return [];
        }

        if (trimmed.StartsWith('|')) trimmed = trimmed[1..];
        if (trimmed.EndsWith('|')) trimmed = trimmed[..^1];

        return trimmed.Split('|', StringSplitOptions.None).Select(cell => cell.Trim()).ToList();
    }

    private static string CleanInline(string value)
    {
        var cleaned = MarkdownHeadingRegex().Replace(value.Trim(), string.Empty);
        cleaned = MarkdownLinkRegex().Replace(cleaned, "$1");
        return cleaned
            .Replace("**", string.Empty, StringComparison.Ordinal)
            .Replace("__", string.Empty, StringComparison.Ordinal)
            .Replace("`", string.Empty, StringComparison.Ordinal)
            .Trim();
    }

    private static void AddBlankLine(List<string> output)
    {
        if (output.Count > 0 && !string.IsNullOrWhiteSpace(output[^1]))
        {
            output.Add(string.Empty);
        }
    }

    [GeneratedRegex(@"^:?-{3,}:?$", RegexOptions.CultureInvariant)]
    private static partial Regex TableSeparatorRegex();

    [GeneratedRegex(@"^\s{0,3}#{1,6}\s+", RegexOptions.CultureInvariant)]
    private static partial Regex MarkdownHeadingRegex();

    [GeneratedRegex(@"\[([^\]]+)\]\([^\)]+\)", RegexOptions.CultureInvariant)]
    private static partial Regex MarkdownLinkRegex();

    [GeneratedRegex(@"^(would you like|do you want|let me know if|if you'd like|i can also)\b.*[?!.]?\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex GenericFollowUpRegex();

    [GeneratedRegex(@"^(here(?:'s| is| are)|below (?:is|are))\b.*:\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex GenericTableIntroRegex();
}
