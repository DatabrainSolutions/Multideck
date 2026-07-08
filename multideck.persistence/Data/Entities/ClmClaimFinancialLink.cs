using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimFinancialLink
{
    public Guid ClmfinLinkId { get; set; }

    public Guid ClmfinLinkClaimId { get; set; }

    public Guid? ClmfinLinkFinDocumentId { get; set; }

    public Guid? ClmfinLinkJobId { get; set; }

    public string ClmfinLinkLinkTypeCode { get; set; } = null!;

    public decimal ClmfinLinkAmount { get; set; }

    public string ClmfinLinkCurrencyCodeSnapshot { get; set; } = null!;

    public DateOnly? ClmfinLinkAccountingDate { get; set; }

    public string? ClmfinLinkNotes { get; set; }

    public DateTime ClmfinLinkCreatedAt { get; set; }

    public Guid? ClmfinLinkCreatedBy { get; set; }

    public virtual ClmClaim ClmfinLinkClaim { get; set; } = null!;

    public virtual CmpUser? ClmfinLinkCreatedByNavigation { get; set; }

    public virtual FinDocument? ClmfinLinkFinDocument { get; set; }

    public virtual JobHeader? ClmfinLinkJob { get; set; }
}
