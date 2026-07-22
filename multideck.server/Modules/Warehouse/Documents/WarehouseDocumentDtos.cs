namespace Multideck.Server.Modules.Warehouse.Documents;

public sealed record WarehouseOrderDocumentDto(
    Guid Id,
    Guid OrderId,
    string Title,
    string DocumentTypeCode,
    string StatusCode,
    string? FileName,
    string? MimeType,
    long? FileSizeBytes,
    DateTime CreatedAt);

public sealed record WarehouseDocumentContent(byte[] Bytes, string ContentType, string FileName);
public sealed record WarehouseDocumentReadUrlDto(string Url, DateTimeOffset ExpiresAt);
public sealed record ReviewWarehouseDocumentRequest(string StatusCode, string? Notes);
