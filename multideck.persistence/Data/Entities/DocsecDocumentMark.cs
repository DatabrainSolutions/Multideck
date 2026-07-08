using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecDocumentMark
{
    public Guid DocsecdmId { get; set; }

    public Guid? DocsecdmVerificationTokenId { get; set; }

    public Guid? DocsecdmJobDocumentId { get; set; }

    public Guid? DocsecdmGeneratedDocumentId { get; set; }

    public string DocsecdmTargetTable { get; set; } = null!;

    public Guid DocsecdmTargetId { get; set; }

    public string DocsecdmMarkTypeCode { get; set; } = null!;

    public string DocsecdmSymbology { get; set; } = null!;

    public string DocsecdmMarkValue { get; set; } = null!;

    public string? DocsecdmDisplayText { get; set; }

    public string? DocsecdmImageStorageBucket { get; set; }

    public string? DocsecdmImageStoragePath { get; set; }

    public string? DocsecdmImageMimeType { get; set; }

    public string DocsecdmPlacementJson { get; set; } = null!;

    public string DocsecdmMetadataJson { get; set; } = null!;

    public DateTime DocsecdmCreatedAt { get; set; }

    public Guid? DocsecdmCreatedBy { get; set; }

    public virtual CmpUser? DocsecdmCreatedByNavigation { get; set; }

    public virtual DocbGeneratedDocument? DocsecdmGeneratedDocument { get; set; }

    public virtual JobDocument? DocsecdmJobDocument { get; set; }

    public virtual SysDocumentSecurityMarkType DocsecdmMarkTypeCodeNavigation { get; set; } = null!;

    public virtual DocsecVerificationToken? DocsecdmVerificationToken { get; set; }
}
