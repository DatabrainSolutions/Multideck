using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Multideck.Documents.Paths;

namespace Multideck.Documents.Supabase;

public sealed class SupabaseDocumentStorage : IDocumentStorage
{
    private readonly SupabaseDocumentStorageOptions options;
    private readonly HttpClient httpClient;
    private readonly IDocumentPathPolicy pathPolicy;
    private readonly string storageUrl;
    private readonly ConcurrentDictionary<string, byte> confirmedBuckets = new(StringComparer.OrdinalIgnoreCase);

    public SupabaseDocumentStorage(
        SupabaseDocumentStorageOptions options,
        HttpClient httpClient,
        IDocumentPathPolicy? pathPolicy = null)
    {
        options.Validate();
        this.options = options;
        this.httpClient = httpClient;
        this.pathPolicy = pathPolicy ?? new ConcernDocumentPathPolicy(options);
        storageUrl = $"{options.Url.TrimEnd('/')}/storage/v1";
    }

    public async Task<StoredDocument> UploadAsync(
        DocumentStorageRequest request,
        Stream content,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (!content.CanRead) throw new ArgumentException("The document content stream must be readable.", nameof(content));
        if (request.ContentLength < 0) throw new ArgumentOutOfRangeException(nameof(request.ContentLength));
        if (string.IsNullOrWhiteSpace(request.Sha256) || request.Sha256.Length != 64)
            throw new ArgumentException("A SHA-256 checksum is required.", nameof(request));

        var address = pathPolicy.Resolve(request);
        await EnsureBucketExistsAsync(address.Bucket, cancellationToken);

        using var httpRequest = CreateRequest(HttpMethod.Post, $"object/{AddressPath(address)}");
        httpRequest.Headers.TryAddWithoutValidation("x-upsert", "false");
        httpRequest.Headers.TryAddWithoutValidation("cache-control", "private, no-store");
        httpRequest.Headers.TryAddWithoutValidation("x-metadata", EncodeMetadata(request));

        var streamContent = new NonDisposingStreamContent(content, request.ContentLength);
        streamContent.Headers.ContentType = MediaTypeHeaderValue.Parse(
            string.IsNullOrWhiteSpace(request.ContentType) ? "application/octet-stream" : request.ContentType);
        streamContent.Headers.ContentDisposition = ContentDisposition(request.FileName);
        httpRequest.Content = streamContent;

        using var response = await httpClient.SendAsync(
            httpRequest,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        await EnsureSuccessAsync(response, "upload the document", cancellationToken);

        var versionId = await ReadUploadObjectIdAsync(response, cancellationToken);
        var etag = response.Headers.ETag?.Tag;
        var objectUri = new Uri($"{storageUrl}/object/{AddressPath(address)}");
        return new StoredDocument(address, objectUri, etag, versionId, DateTimeOffset.UtcNow);
    }

    public async Task DownloadToAsync(
        DocumentStorageAddress address,
        Stream destination,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(destination);
        if (!destination.CanWrite)
            throw new ArgumentException("The document destination stream must be writable.", nameof(destination));

        using var request = CreateRequest(HttpMethod.Get, $"object/{AddressPath(address)}");
        using var response = await httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        await EnsureSuccessAsync(response, "download the document", cancellationToken);
        await response.Content.CopyToAsync(destination, cancellationToken);
    }

    public async Task<DocumentReadAccess> CreateReadAccessAsync(
        DocumentStorageAddress address,
        string downloadFileName,
        TimeSpan? lifetime = null,
        CancellationToken cancellationToken = default)
    {
        var accessLifetime = lifetime ?? TimeSpan.FromMinutes(options.ReadAccessMinutes);
        if (accessLifetime <= TimeSpan.Zero || accessLifetime > TimeSpan.FromMinutes(60))
            throw new ArgumentOutOfRangeException(nameof(lifetime), "Document read access must expire within 60 minutes.");

        var expiresIn = Math.Max(1, (int)Math.Ceiling(accessLifetime.TotalSeconds));
        using var request = CreateRequest(HttpMethod.Post, $"object/sign/{AddressPath(address)}");
        request.Content = JsonContent.Create(new { expiresIn });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "create a document read URL", cancellationToken);

        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        using var document = JsonDocument.Parse(responseBody);
        if (!document.RootElement.TryGetProperty("signedURL", out var signedUrlElement) ||
            string.IsNullOrWhiteSpace(signedUrlElement.GetString()))
        {
            throw new InvalidOperationException("Supabase Storage did not return a signed document URL.");
        }

        var signedPath = signedUrlElement.GetString()!;
        var signedUrl = Uri.TryCreate(signedPath, UriKind.Absolute, out var absoluteUrl)
            ? absoluteUrl.ToString()
            : $"{storageUrl}{(signedPath.StartsWith('/') ? "" : "/")}{signedPath}";
        var safeFileName = SafeFileName(downloadFileName);
        signedUrl = $"{signedUrl}{(signedUrl.Contains('?') ? '&' : '?')}download={Uri.EscapeDataString(safeFileName)}";

        return new DocumentReadAccess(new Uri(signedUrl), DateTimeOffset.UtcNow.AddSeconds(expiresIn));
    }

    public async Task DeleteIfExistsAsync(
        DocumentStorageAddress address,
        CancellationToken cancellationToken = default)
    {
        using var request = CreateRequest(HttpMethod.Delete, $"object/{EscapeSegment(address.Bucket)}");
        request.Content = JsonContent.Create(new { prefixes = new[] { address.ObjectPath } });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "delete the document", cancellationToken);
    }

    private async Task EnsureBucketExistsAsync(string bucket, CancellationToken cancellationToken)
    {
        if (confirmedBuckets.ContainsKey(bucket)) return;

        using var getRequest = CreateRequest(HttpMethod.Get, $"bucket/{EscapeSegment(bucket)}");
        using var getResponse = await httpClient.SendAsync(getRequest, cancellationToken);
        if (getResponse.IsSuccessStatusCode)
        {
            confirmedBuckets.TryAdd(bucket, 0);
            return;
        }

        if (getResponse.StatusCode != HttpStatusCode.NotFound)
        {
            await EnsureSuccessAsync(getResponse, $"check the '{bucket}' document bucket", cancellationToken);
        }

        using var createRequest = CreateRequest(HttpMethod.Post, "bucket/");
        createRequest.Content = JsonContent.Create(new { id = bucket, name = bucket, @public = false });
        using var createResponse = await httpClient.SendAsync(createRequest, cancellationToken);
        if (!createResponse.IsSuccessStatusCode && createResponse.StatusCode != HttpStatusCode.Conflict)
        {
            await EnsureSuccessAsync(createResponse, $"create the private '{bucket}' document bucket", cancellationToken);
        }

        confirmedBuckets.TryAdd(bucket, 0);
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string relativePath)
    {
        var request = new HttpRequestMessage(method, $"{storageUrl}/{relativePath.TrimStart('/')}");
        request.Headers.TryAddWithoutValidation("apikey", options.ApiKey);
        request.Headers.TryAddWithoutValidation("x-client-info", "multideck-documents/1.0");

        // Legacy service-role keys are JWTs and Storage expects them as a bearer token.
        // New sb_secret_ keys must only be sent in the apikey header.
        if (!options.ApiKey.StartsWith("sb_", StringComparison.Ordinal))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        }

        return request;
    }

    private static string AddressPath(DocumentStorageAddress address)
    {
        if (string.IsNullOrWhiteSpace(address.Bucket))
            throw new ArgumentException("A Supabase Storage bucket is required.", nameof(address));
        if (string.IsNullOrWhiteSpace(address.ObjectPath))
            throw new ArgumentException("A Supabase Storage object path is required.", nameof(address));

        var objectPath = string.Join('/', address.ObjectPath
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(EscapeSegment));
        return $"{EscapeSegment(address.Bucket)}/{objectPath}";
    }

    private static string EscapeSegment(string value) => Uri.EscapeDataString(value);

    private static string EncodeMetadata(DocumentStorageRequest request)
    {
        var metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (request.Metadata is not null)
        {
            foreach (var pair in request.Metadata.Where(pair =>
                         !string.IsNullOrWhiteSpace(pair.Key) &&
                         !string.IsNullOrWhiteSpace(pair.Value)))
            {
                metadata[pair.Key.Trim()] = pair.Value.Trim();
            }
        }

        metadata["documentid"] = request.DocumentId.ToString("N");
        metadata["concern"] = request.Concern.ToCode();
        metadata["aggregatetype"] = request.AggregateType.Trim();
        metadata["aggregateid"] = request.AggregateId.ToString("N");
        metadata["sha256"] = request.Sha256.ToLowerInvariant();
        if (request.OrganisationId.HasValue)
            metadata["organisationid"] = request.OrganisationId.Value.ToString("N");

        var json = JsonSerializer.Serialize(metadata);
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }

    private static ContentDispositionHeaderValue ContentDisposition(string fileName)
    {
        var safe = SafeFileName(fileName);
        var ascii = string.Concat(safe.Select(character => character is >= ' ' and <= '~' ? character : '_'));
        return new ContentDispositionHeaderValue("attachment")
        {
            FileName = $"\"{ascii.Replace("\"", "", StringComparison.Ordinal)}\"",
            FileNameStar = safe,
        };
    }

    private static string SafeFileName(string fileName)
    {
        var safe = Path.GetFileName(fileName)
            .Replace("\"", "", StringComparison.Ordinal)
            .Replace("\r", "", StringComparison.Ordinal)
            .Replace("\n", "", StringComparison.Ordinal);
        return string.IsNullOrWhiteSpace(safe) ? "document" : safe;
    }

    private static async Task<string?> ReadUploadObjectIdAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(responseBody)) return null;

        using var document = JsonDocument.Parse(responseBody);
        return document.RootElement.TryGetProperty("Id", out var id) ? id.GetString() : null;
    }

    private static async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        string operation,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;

        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        var detail = ReadErrorMessage(responseBody);
        throw new HttpRequestException(
            $"Supabase Storage could not {operation}: {detail}",
            null,
            response.StatusCode);
    }

    private static string ReadErrorMessage(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody)) return "no error details were returned.";

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            foreach (var propertyName in new[] { "message", "error", "code" })
            {
                if (document.RootElement.TryGetProperty(propertyName, out var value) &&
                    value.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrWhiteSpace(value.GetString()))
                {
                    return value.GetString()![..Math.Min(value.GetString()!.Length, 500)];
                }
            }
        }
        catch (JsonException)
        {
            // Fall through to a bounded plain-text error.
        }

        var singleLine = responseBody.Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal);
        return singleLine[..Math.Min(singleLine.Length, 500)];
    }

    private sealed class NonDisposingStreamContent(Stream source, long contentLength) : HttpContent
    {
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) =>
            source.CopyToAsync(stream);

        protected override Task SerializeToStreamAsync(
            Stream stream,
            TransportContext? context,
            CancellationToken cancellationToken) =>
            source.CopyToAsync(stream, cancellationToken);

        protected override bool TryComputeLength(out long length)
        {
            length = contentLength;
            return true;
        }
    }
}
