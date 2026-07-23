using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlSecuritySummary
{
    public Guid? BlId { get; set; }

    public string? BlNumber { get; set; }

    public string? BlDocumentType { get; set; }

    public string? BlStatus { get; set; }

    public DateTime? BlIssueDateTime { get; set; }

    public DateOnly? BlDocumentDate { get; set; }

    public int? BlNumberOfOriginals { get; set; }

    public int? BlNumberOfCopies { get; set; }

    public bool? BlNegotiable { get; set; }

    public bool? BlToOrder { get; set; }

    public Guid? BlOrgOfficeId { get; set; }

    public Guid? BlLegalEntityId { get; set; }

    public Guid? BlBrandId { get; set; }

    public Guid? BlscId { get; set; }

    public string? BlscSecurityStatusCode { get; set; }

    public string? BlsecurityStatusName { get; set; }

    public bool? BlsecurityIsValidForRelease { get; set; }

    public Guid? BlscCurrentFingerprintId { get; set; }

    public string? CurrentFileSha256 { get; set; }

    public Guid? BlscCurrentVerificationTokenId { get; set; }

    public string? CurrentVerificationPublicCode { get; set; }

    public string? CurrentVerificationUrl { get; set; }

    public string? CurrentVerificationTokenStatusCode { get; set; }

    public string? BlscOriginalSetId { get; set; }

    public int? BlscNumberOfOriginalsSecured { get; set; }

    public bool? BlscNegotiableSnapshot { get; set; }

    public bool? BlscToOrderSnapshot { get; set; }

    public bool? BlscQrrequired { get; set; }

    public string? BlscQrpublicUrl { get; set; }

    public DateTime? BlscLastVerificationAt { get; set; }

    public int? BlscVerificationCount { get; set; }

    public bool? BlscFraudHold { get; set; }

    public string? BlscFraudHoldReason { get; set; }

    public DateTime? BlscRevokedAt { get; set; }

    public string? BlscRevocationReason { get; set; }

    public int? OpenSecurityIssueCount { get; set; }
}
