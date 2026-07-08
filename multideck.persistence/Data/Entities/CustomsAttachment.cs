using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsAttachment
{
    public Guid CustaId { get; set; }

    public Guid CustaCustomsId { get; set; }

    public string CustaAttachmentType { get; set; } = null!;

    public string CustaFileName { get; set; } = null!;

    public string? CustaFilePath { get; set; }

    public string? CustaFileUrl { get; set; }

    public string? CustaMimeType { get; set; }

    public long? CustaFileSizeBytes { get; set; }

    public string? CustaChecksum { get; set; }

    public string? CustaICustomsUploadId { get; set; }

    public DateTime CustaCreatedAt { get; set; }

    public Guid? CustaCreatedBy { get; set; }

    public Guid? CustaJobDocumentId { get; set; }

    public virtual CustomsDeclaration CustaCustoms { get; set; } = null!;

    public virtual JobDocument? CustaJobDocument { get; set; }
}
