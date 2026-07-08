using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Files attached to an AWB, including PDFs, Cargo-XML payloads, validation reports, and supporting documents.
/// </summary>
public partial class AwbAttachment
{
    public Guid AwbaId { get; set; }

    public Guid AwbaAwbid { get; set; }

    public string AwbaAttachmentType { get; set; } = null!;

    public string AwbaFileName { get; set; } = null!;

    public string? AwbaFilePath { get; set; }

    public string? AwbaFileUrl { get; set; }

    public string? AwbaMimeType { get; set; }

    public long? AwbaFileSizeBytes { get; set; }

    public string? AwbaChecksum { get; set; }

    public int AwbaVersionNumber { get; set; }

    public bool AwbaIsPrimary { get; set; }

    public string? AwbaDescription { get; set; }

    public DateTime AwbaCreatedAt { get; set; }

    public Guid? AwbaCreatedBy { get; set; }

    public Guid? AwbaJobDocumentId { get; set; }

    public virtual AwbHeader AwbaAwb { get; set; } = null!;

    public virtual JobDocument? AwbaJobDocument { get; set; }
}
