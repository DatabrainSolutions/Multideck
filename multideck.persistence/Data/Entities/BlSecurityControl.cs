using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlSecurityControl
{
    public Guid BlscId { get; set; }

    public Guid BlscBlid { get; set; }

    public Guid? BlscSecurityProfileId { get; set; }

    public Guid? BlscCurrentFingerprintId { get; set; }

    public Guid? BlscCurrentVerificationTokenId { get; set; }

    public Guid? BlscSigningKeyId { get; set; }

    public string BlscSecurityStatusCode { get; set; } = null!;

    public string? BlscOriginalSetId { get; set; }

    public int BlscNumberOfOriginalsSecured { get; set; }

    public bool BlscNegotiableSnapshot { get; set; }

    public bool BlscToOrderSnapshot { get; set; }

    public bool BlscQrrequired { get; set; }

    public string? BlscQrpublicUrl { get; set; }

    public string? BlscVerificationInstructions { get; set; }

    public DateTime? BlscLastVerificationAt { get; set; }

    public int BlscVerificationCount { get; set; }

    public bool BlscFraudHold { get; set; }

    public string? BlscFraudHoldReason { get; set; }

    public DateTime? BlscRevokedAt { get; set; }

    public Guid? BlscRevokedBy { get; set; }

    public string? BlscRevocationReason { get; set; }

    public string BlscMetadataJson { get; set; } = null!;

    public DateTime BlscCreatedAt { get; set; }

    public Guid? BlscCreatedBy { get; set; }

    public DateTime BlscUpdatedAt { get; set; }

    public Guid? BlscUpdatedBy { get; set; }

    public virtual BlHeader BlscBl { get; set; } = null!;

    public virtual CmpUser? BlscCreatedByNavigation { get; set; }

    public virtual DocsecDocumentFingerprint? BlscCurrentFingerprint { get; set; }

    public virtual DocsecVerificationToken? BlscCurrentVerificationToken { get; set; }

    public virtual CmpUser? BlscRevokedByNavigation { get; set; }

    public virtual DocsecSecurityProfile? BlscSecurityProfile { get; set; }

    public virtual SysBlsecurityStatus BlscSecurityStatusCodeNavigation { get; set; } = null!;

    public virtual DocsecSigningKey? BlscSigningKey { get; set; }

    public virtual CmpUser? BlscUpdatedByNavigation { get; set; }
}
