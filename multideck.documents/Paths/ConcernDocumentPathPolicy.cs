using System.Text;
using Multideck.Documents.Azure;

namespace Multideck.Documents.Paths;

public sealed class ConcernDocumentPathPolicy(AzureDocumentStorageOptions options) : IDocumentPathPolicy
{
    public DocumentStorageAddress Resolve(DocumentStorageRequest request)
    {
        var environment = ToSegment(options.EnvironmentPrefix, "development");
        var organisation = request.OrganisationId?.ToString("N") ?? "shared";
        var aggregateType = ToSegment(request.AggregateType, "general");
        var extension = SafeExtension(request.FileName);
        var created = request.CreatedAt.UtcDateTime;
        var blobName = string.Join('/',
            "v1",
            environment,
            organisation,
            request.Concern.ToCode(),
            aggregateType,
            request.AggregateId.ToString("N"),
            created.ToString("yyyy"),
            created.ToString("MM"),
            $"{request.DocumentId:N}{extension}");
        return new DocumentStorageAddress(options.ContainerFor(request.Concern), blobName);
    }

    private static string ToSegment(string value, string fallback)
    {
        var source = value.Trim().ToLowerInvariant();
        var result = new StringBuilder(source.Length);
        var lastWasDash = false;
        foreach (var character in source)
        {
            var allowed = char.IsAsciiLetterOrDigit(character);
            if (allowed)
            {
                result.Append(character);
                lastWasDash = false;
            }
            else if (!lastWasDash)
            {
                result.Append('-');
                lastWasDash = true;
            }
        }

        var segment = result.ToString().Trim('-');
        return string.IsNullOrWhiteSpace(segment) ? fallback : segment[..Math.Min(segment.Length, 80)];
    }

    private static string SafeExtension(string fileName)
    {
        var extension = Path.GetExtension(Path.GetFileName(fileName)).ToLowerInvariant();
        if (extension.Length is < 2 or > 12) return "";
        return extension.Skip(1).All(char.IsAsciiLetterOrDigit) ? extension : "";
    }
}
