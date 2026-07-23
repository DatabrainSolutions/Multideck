using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAuthorisationRequest
{
    public Guid FinauthreqId { get; set; }

    public string FinauthreqActionTypeCode { get; set; } = null!;

    public string FinauthreqStatusCode { get; set; } = null!;

    public string FinauthreqSourceTable { get; set; } = null!;

    public Guid FinauthreqSourceId { get; set; }

    public Guid? FinauthreqJobId { get; set; }

    public Guid? FinauthreqDocumentId { get; set; }

    public Guid? FinauthreqRequestedBy { get; set; }

    public DateTime FinauthreqRequestedAt { get; set; }

    public decimal? FinauthreqAmount { get; set; }

    public string? FinauthreqCurrencyCodeSnapshot { get; set; }

    public string? FinauthreqReason { get; set; }

    public string FinauthreqOldValuesJson { get; set; } = null!;

    public string FinauthreqNewValuesJson { get; set; } = null!;

    public string FinauthreqContextJson { get; set; } = null!;

    public virtual ICollection<FinAccountingDateOverride> FinAccountingDateOverrides { get; set; } = new List<FinAccountingDateOverride>();

    public virtual ICollection<FinAuthorisationDecision> FinAuthorisationDecisions { get; set; } = new List<FinAuthorisationDecision>();

    public virtual ICollection<FinCommissionAdjustment> FinCommissionAdjustments { get; set; } = new List<FinCommissionAdjustment>();

    public virtual ICollection<FinCreditNoteApproval> FinCreditNoteApprovals { get; set; } = new List<FinCreditNoteApproval>();

    public virtual ICollection<FinDocumentApproval> FinDocumentApprovals { get; set; } = new List<FinDocumentApproval>();

    public virtual ICollection<FinRoeoverride> FinRoeoverrides { get; set; } = new List<FinRoeoverride>();

    public virtual ICollection<FinVarianceApproval> FinVarianceApprovals { get; set; } = new List<FinVarianceApproval>();

    public virtual SysFinanceAuthorityActionType FinauthreqActionTypeCodeNavigation { get; set; } = null!;

    public virtual JobHeader? FinauthreqJob { get; set; }

    public virtual CmpUser? FinauthreqRequestedByNavigation { get; set; }
}
