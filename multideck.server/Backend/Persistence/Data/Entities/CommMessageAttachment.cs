using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageAttachment
{
    public Guid CommAttachmentId { get; set; }

    public Guid CommAttachmentMessageId { get; set; }

    public Guid? CommAttachmentJobDocumentId { get; set; }

    public Guid? CommAttachmentGeneratedDocumentId { get; set; }

    public string CommAttachmentFileName { get; set; } = null!;

    public string? CommAttachmentMimeType { get; set; }

    public long? CommAttachmentFileSizeBytes { get; set; }

    public string? CommAttachmentStorageBucket { get; set; }

    public string? CommAttachmentStoragePath { get; set; }

    public string? CommAttachmentExternalUrl { get; set; }

    public string? CommAttachmentContentId { get; set; }

    public string? CommAttachmentDisposition { get; set; }

    public string? CommAttachmentFileHashSha256 { get; set; }

    public bool CommAttachmentIsInline { get; set; }

    public bool CommAttachmentIsScanned { get; set; }

    public string? CommAttachmentScanStatus { get; set; }

    public string CommAttachmentMetadataJson { get; set; } = null!;

    public DateTime CommAttachmentCreatedAt { get; set; }

    public Guid? CommAttachmentCreatedBy { get; set; }

    public virtual CmpUser? CommAttachmentCreatedByNavigation { get; set; }

    public virtual DocbGeneratedDocument? CommAttachmentGeneratedDocument { get; set; }

    public virtual JobDocument? CommAttachmentJobDocument { get; set; }

    public virtual CommMessage CommAttachmentMessage { get; set; } = null!;
}
