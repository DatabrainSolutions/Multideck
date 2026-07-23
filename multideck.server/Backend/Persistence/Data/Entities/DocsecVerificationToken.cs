using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecVerificationToken
{
    public Guid DocsecvtId { get; set; }

    public string DocsecvtPublicCode { get; set; } = null!;

    public string? DocsecvtTokenHashSha256 { get; set; }

    public Guid? DocsecvtSecurityProfileId { get; set; }

    public Guid? DocsecvtFingerprintId { get; set; }

    public Guid? DocsecvtJobDocumentId { get; set; }

    public Guid? DocsecvtGeneratedDocumentId { get; set; }

    public string DocsecvtTargetTable { get; set; } = null!;

    public Guid DocsecvtTargetId { get; set; }

    public Guid? DocsecvtBlid { get; set; }

    public string? DocsecvtDocumentNumberSnapshot { get; set; }

    public string DocsecvtStatusCode { get; set; } = null!;

    public string? DocsecvtVerificationUrl { get; set; }

    public string? DocsecvtQrpayload { get; set; }

    public DateTime DocsecvtValidFrom { get; set; }

    public DateTime? DocsecvtExpiresAt { get; set; }

    public DateTime? DocsecvtRevokedAt { get; set; }

    public Guid? DocsecvtRevokedBy { get; set; }

    public string? DocsecvtRevocationReason { get; set; }

    public int? DocsecvtMaxVerificationCount { get; set; }

    public int DocsecvtVerificationCount { get; set; }

    public DateTime? DocsecvtLastVerifiedAt { get; set; }

    public string DocsecvtMetadataJson { get; set; } = null!;

    public DateTime DocsecvtCreatedAt { get; set; }

    public Guid? DocsecvtCreatedBy { get; set; }

    public DateTime DocsecvtUpdatedAt { get; set; }

    public Guid? DocsecvtUpdatedBy { get; set; }

    public virtual ICollection<BlSecurityControl> BlSecurityControls { get; set; } = new List<BlSecurityControl>();

    public virtual ICollection<DocsecDocumentMark> DocsecDocumentMarks { get; set; } = new List<DocsecDocumentMark>();

    public virtual ICollection<DocsecVerificationEvent> DocsecVerificationEvents { get; set; } = new List<DocsecVerificationEvent>();

    public virtual ICollection<DocsecVerificationIssue> DocsecVerificationIssues { get; set; } = new List<DocsecVerificationIssue>();

    public virtual BlHeader? DocsecvtBl { get; set; }

    public virtual CmpUser? DocsecvtCreatedByNavigation { get; set; }

    public virtual DocsecDocumentFingerprint? DocsecvtFingerprint { get; set; }

    public virtual DocbGeneratedDocument? DocsecvtGeneratedDocument { get; set; }

    public virtual JobDocument? DocsecvtJobDocument { get; set; }

    public virtual CmpUser? DocsecvtRevokedByNavigation { get; set; }

    public virtual DocsecSecurityProfile? DocsecvtSecurityProfile { get; set; }

    public virtual SysDocumentSecurityTokenStatus DocsecvtStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? DocsecvtUpdatedByNavigation { get; set; }

    public virtual ICollection<PortalDocumentShare> PortalDocumentShares { get; set; } = new List<PortalDocumentShare>();
}
