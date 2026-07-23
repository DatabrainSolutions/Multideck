using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecDocumentFingerprint
{
    public Guid DocsecfId { get; set; }

    public Guid? DocsecfJobDocumentId { get; set; }

    public Guid? DocsecfGeneratedDocumentId { get; set; }

    public string DocsecfTargetTable { get; set; } = null!;

    public Guid DocsecfTargetId { get; set; }

    public string? DocsecfDocumentTypeCodeSnapshot { get; set; }

    public string? DocsecfDocumentNumberSnapshot { get; set; }

    public string? DocsecfFileName { get; set; }

    public long? DocsecfFileSizeBytes { get; set; }

    public string DocsecfFileSha256 { get; set; } = null!;

    public string? DocsecfCanonicalPayloadSha256 { get; set; }

    public string? DocsecfVisualHashSha256 { get; set; }

    public string DocsecfFingerprintJson { get; set; } = null!;

    public bool DocsecfIsCurrent { get; set; }

    public DateTime DocsecfCreatedAt { get; set; }

    public Guid? DocsecfCreatedBy { get; set; }

    public virtual ICollection<BlSecurityControl> BlSecurityControls { get; set; } = new List<BlSecurityControl>();

    public virtual ICollection<DocsecDocumentSignature> DocsecDocumentSignatures { get; set; } = new List<DocsecDocumentSignature>();

    public virtual ICollection<DocsecVerificationEvent> DocsecVerificationEvents { get; set; } = new List<DocsecVerificationEvent>();

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokens { get; set; } = new List<DocsecVerificationToken>();

    public virtual CmpUser? DocsecfCreatedByNavigation { get; set; }

    public virtual DocbGeneratedDocument? DocsecfGeneratedDocument { get; set; }

    public virtual JobDocument? DocsecfJobDocument { get; set; }
}
