using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecPublicVerificationSummary
{
    public string? DocsecvtPublicCode { get; set; }

    public string? DocsecvtStatusCode { get; set; }

    public string? TokenStatusName { get; set; }

    public bool? TokenIsValidForPublicVerification { get; set; }

    public string? DocsecvtDocumentNumberSnapshot { get; set; }

    public string? DocsecvtTargetTable { get; set; }

    public string? Blnumber { get; set; }

    public string? Blstatus { get; set; }

    public string? DocsecfFileSha256 { get; set; }

    public string? DocsecfCanonicalPayloadSha256 { get; set; }

    public bool? SignatureIsValid { get; set; }

    public DateTime? DocsecvtValidFrom { get; set; }

    public DateTime? DocsecvtExpiresAt { get; set; }

    public DateTime? DocsecvtRevokedAt { get; set; }

    public int? DocsecvtVerificationCount { get; set; }

    public DateTime? DocsecvtLastVerifiedAt { get; set; }

    public int? OpenIssueCount { get; set; }
}
