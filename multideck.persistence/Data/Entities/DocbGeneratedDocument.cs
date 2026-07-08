using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbGeneratedDocument
{
    public Guid DocbgdId { get; set; }

    public Guid DocbgdRenderJobId { get; set; }

    public Guid DocbgdTemplateId { get; set; }

    public Guid? DocbgdTemplateVersionId { get; set; }

    public Guid? DocbgdJobDocumentId { get; set; }

    public string DocbgdOutputFormatCode { get; set; } = null!;

    public string DocbgdFileName { get; set; } = null!;

    public string? DocbgdStorageBucket { get; set; }

    public string? DocbgdStoragePath { get; set; }

    public string? DocbgdFileUrl { get; set; }

    public string? DocbgdMimeType { get; set; }

    public long? DocbgdFileSizeBytes { get; set; }

    public string? DocbgdSha256 { get; set; }

    public int DocbgdVersionNo { get; set; }

    public bool DocbgdIsCurrentVersion { get; set; }

    public string DocbgdMetadataJson { get; set; } = null!;

    public DateTime DocbgdCreatedAt { get; set; }

    public Guid? DocbgdCreatedBy { get; set; }

    public virtual ICollection<CommMessageAttachment> CommMessageAttachments { get; set; } = new List<CommMessageAttachment>();

    public virtual ICollection<DocbRenderedPage> DocbRenderedPages { get; set; } = new List<DocbRenderedPage>();

    public virtual CmpUser? DocbgdCreatedByNavigation { get; set; }

    public virtual JobDocument? DocbgdJobDocument { get; set; }

    public virtual SysDocBuilderOutputFormat DocbgdOutputFormatCodeNavigation { get; set; } = null!;

    public virtual DocbRenderJob DocbgdRenderJob { get; set; } = null!;

    public virtual DocbDocumentTemplate DocbgdTemplate { get; set; } = null!;

    public virtual DocbTemplateVersion? DocbgdTemplateVersion { get; set; }

    public virtual ICollection<DocsecDocumentFingerprint> DocsecDocumentFingerprints { get; set; } = new List<DocsecDocumentFingerprint>();

    public virtual ICollection<DocsecDocumentMark> DocsecDocumentMarks { get; set; } = new List<DocsecDocumentMark>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokens { get; set; } = new List<DocsecVerificationToken>();

    public virtual ICollection<DocsigRequest> DocsigRequests { get; set; } = new List<DocsigRequest>();

    public virtual ICollection<PortalDocumentShare> PortalDocumentShares { get; set; } = new List<PortalDocumentShare>();

    public virtual ICollection<WmsDocument> WmsDocuments { get; set; } = new List<WmsDocument>();
}
