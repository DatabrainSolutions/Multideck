using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsAttachment
{
    public Guid CdsaId { get; set; }

    public Guid CdsaCdsid { get; set; }

    public string CdsaAttachmentType { get; set; } = null!;

    public string CdsaFileName { get; set; } = null!;

    public string? CdsaFilePath { get; set; }

    public string? CdsaFileUrl { get; set; }

    public string? CdsaMimeType { get; set; }

    public long? CdsaFileSizeBytes { get; set; }

    public string? CdsaChecksum { get; set; }

    public string? CdsaICustomsUploadId { get; set; }

    public DateTime CdsaCreatedAt { get; set; }

    public Guid? CdsaCreatedBy { get; set; }

    public Guid? CdsaJobDocumentId { get; set; }

    public virtual CdsDeclaration CdsaCds { get; set; } = null!;

    public virtual JobDocument? CdsaJobDocument { get; set; }
}
