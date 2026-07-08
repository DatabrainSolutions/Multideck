using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmPolicyDocument
{
    public Guid ClmpolDocId { get; set; }

    public Guid ClmpolDocPolicyId { get; set; }

    public string ClmpolDocDocumentTypeCode { get; set; } = null!;

    public Guid? ClmpolDocJobDocumentId { get; set; }

    public string ClmpolDocTitle { get; set; } = null!;

    public string? ClmpolDocFileName { get; set; }

    public string? ClmpolDocFileUrl { get; set; }

    public string? ClmpolDocFileHash { get; set; }

    public DateTime? ClmpolDocIssuedAt { get; set; }

    public DateTime? ClmpolDocExpiresAt { get; set; }

    public bool ClmpolDocIsCurrent { get; set; }

    public string ClmpolDocMetadataJson { get; set; } = null!;

    public DateTime ClmpolDocCreatedAt { get; set; }

    public Guid? ClmpolDocCreatedBy { get; set; }

    public virtual CmpUser? ClmpolDocCreatedByNavigation { get; set; }

    public virtual SysClmdocumentType ClmpolDocDocumentTypeCodeNavigation { get; set; } = null!;

    public virtual JobDocument? ClmpolDocJobDocument { get; set; }

    public virtual ClmInsurancePolicy ClmpolDocPolicy { get; set; } = null!;
}
