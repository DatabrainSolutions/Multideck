using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimDocument
{
    public Guid ClmclaimDocId { get; set; }

    public Guid ClmclaimDocClaimId { get; set; }

    public string ClmclaimDocDocumentTypeCode { get; set; } = null!;

    public Guid? ClmclaimDocJobDocumentId { get; set; }

    public string ClmclaimDocTitle { get; set; } = null!;

    public string? ClmclaimDocFileName { get; set; }

    public string? ClmclaimDocFileUrl { get; set; }

    public string? ClmclaimDocFileHash { get; set; }

    public bool ClmclaimDocIsEvidence { get; set; }

    public bool ClmclaimDocIsCurrent { get; set; }

    public DateTime? ClmclaimDocReceivedAt { get; set; }

    public DateTime ClmclaimDocCreatedAt { get; set; }

    public Guid? ClmclaimDocCreatedBy { get; set; }

    public virtual ClmClaim ClmclaimDocClaim { get; set; } = null!;

    public virtual CmpUser? ClmclaimDocCreatedByNavigation { get; set; }

    public virtual SysClmdocumentType ClmclaimDocDocumentTypeCodeNavigation { get; set; } = null!;

    public virtual JobDocument? ClmclaimDocJobDocument { get; set; }
}
