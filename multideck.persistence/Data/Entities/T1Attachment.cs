using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Attachment
{
    public Guid T1aId { get; set; }

    public Guid T1aT1id { get; set; }

    public string T1aAttachmentType { get; set; } = null!;

    public string T1aFileName { get; set; } = null!;

    public string? T1aFilePath { get; set; }

    public string? T1aFileUrl { get; set; }

    public string? T1aMimeType { get; set; }

    public long? T1aFileSizeBytes { get; set; }

    public string? T1aChecksum { get; set; }

    public string? T1aICustomsUploadId { get; set; }

    public DateTime T1aCreatedAt { get; set; }

    public Guid? T1aCreatedBy { get; set; }

    public Guid? T1aJobDocumentId { get; set; }

    public virtual JobDocument? T1aJobDocument { get; set; }

    public virtual T1Declaration T1aT1 { get; set; } = null!;
}
