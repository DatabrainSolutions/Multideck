using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimLine
{
    public Guid ClmclaimLineId { get; set; }

    public Guid ClmclaimLineClaimId { get; set; }

    public Guid? ClmclaimLineIncidentCargoId { get; set; }

    public int ClmclaimLineLineNo { get; set; }

    public string ClmclaimLineLossTypeCode { get; set; } = null!;

    public string ClmclaimLineDescription { get; set; } = null!;

    public decimal ClmclaimLineQuantity { get; set; }

    public decimal ClmclaimLineUnitAmount { get; set; }

    public decimal ClmclaimLineClaimedAmount { get; set; }

    public decimal ClmclaimLineAcceptedAmount { get; set; }

    public decimal ClmclaimLineRejectedAmount { get; set; }

    public decimal ClmclaimLineRecoveredAmount { get; set; }

    public string ClmclaimLineCurrencyCodeSnapshot { get; set; } = null!;

    public decimal ClmclaimLineExchangeRate { get; set; }

    public decimal ClmclaimLineLocalClaimedAmount { get; set; }

    public string ClmclaimLineMetadataJson { get; set; } = null!;

    public DateTime ClmclaimLineCreatedAt { get; set; }

    public Guid? ClmclaimLineCreatedBy { get; set; }

    public virtual ClmClaim ClmclaimLineClaim { get; set; } = null!;

    public virtual CmpUser? ClmclaimLineCreatedByNavigation { get; set; }

    public virtual ClmIncidentCargoItem? ClmclaimLineIncidentCargo { get; set; }

    public virtual SysClmlossType ClmclaimLineLossTypeCodeNavigation { get; set; } = null!;
}
