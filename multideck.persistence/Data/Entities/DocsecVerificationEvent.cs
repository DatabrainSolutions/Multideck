using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecVerificationEvent
{
    public Guid DocsecveId { get; set; }

    public Guid? DocsecveVerificationTokenId { get; set; }

    public string? DocsecvePublicCodeSnapshot { get; set; }

    public string DocsecveStatusCode { get; set; } = null!;

    public string DocsecveRiskLevelCode { get; set; } = null!;

    public DateTime DocsecveVerifiedAt { get; set; }

    public string DocsecveVerificationMethod { get; set; } = null!;

    public string? DocsecveDocumentHashSubmittedSha256 { get; set; }

    public Guid? DocsecveMatchedFingerprintId { get; set; }

    public string? DocsecveIpaddressHashSha256 { get; set; }

    public string? DocsecveUserAgent { get; set; }

    public string? DocsecveCountryCode { get; set; }

    public string? DocsecveRefererHost { get; set; }

    public string? DocsecveResultMessage { get; set; }

    public string DocsecveMetadataJson { get; set; } = null!;

    public virtual ICollection<DocsecVerificationIssue> DocsecVerificationIssues { get; set; } = new List<DocsecVerificationIssue>();

    public virtual DocsecDocumentFingerprint? DocsecveMatchedFingerprint { get; set; }

    public virtual SysDocumentSecurityRiskLevel DocsecveRiskLevelCodeNavigation { get; set; } = null!;

    public virtual SysDocumentSecurityVerificationStatus DocsecveStatusCodeNavigation { get; set; } = null!;

    public virtual DocsecVerificationToken? DocsecveVerificationToken { get; set; }
}
