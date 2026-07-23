using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecVerificationSummary
{
    public Guid? DocsecvtId { get; set; }

    public string? DocsecvtPublicCode { get; set; }

    public string? DocsecvtStatusCode { get; set; }

    public string? TokenStatusName { get; set; }

    public bool? TokenIsValidForPublicVerification { get; set; }

    public string? DocsecvtVerificationUrl { get; set; }

    public string? DocsecvtTargetTable { get; set; }

    public Guid? DocsecvtTargetId { get; set; }

    public Guid? DocsecvtBlid { get; set; }

    public string? Blnumber { get; set; }

    public string? Blstatus { get; set; }

    public string? DocsecvtDocumentNumberSnapshot { get; set; }

    public Guid? DocsecvtJobDocumentId { get; set; }

    public string? JobDocumentTitle { get; set; }

    public string? JobDocumentFileName { get; set; }

    public Guid? DocsecvtGeneratedDocumentId { get; set; }

    public string? GeneratedFileName { get; set; }

    public Guid? DocsecfId { get; set; }

    public string? DocsecfFileSha256 { get; set; }

    public string? DocsecfCanonicalPayloadSha256 { get; set; }

    public string? FingerprintFileName { get; set; }

    public bool? FingerprintIsCurrent { get; set; }

    public Guid? DocsecsigId { get; set; }

    public string? DocsecsigAlgorithmCode { get; set; }

    public DateTime? DocsecsigSignedAt { get; set; }

    public bool? SignatureIsValid { get; set; }

    public DateTime? DocsecvtValidFrom { get; set; }

    public DateTime? DocsecvtExpiresAt { get; set; }

    public DateTime? DocsecvtRevokedAt { get; set; }

    public int? DocsecvtVerificationCount { get; set; }

    public DateTime? DocsecvtLastVerifiedAt { get; set; }

    public int? VerificationEventCount { get; set; }

    public int? OpenIssueCount { get; set; }
}
