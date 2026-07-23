using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditNoteRequest
{
    public Guid FincnrqId { get; set; }

    public Guid FincnrqSourceDocumentId { get; set; }

    public Guid? FincnrqResultCreditDocumentId { get; set; }

    public string FincnrqReasonCode { get; set; } = null!;

    public string FincnrqStatusCode { get; set; } = null!;

    public decimal FincnrqRequestedAmount { get; set; }

    public decimal FincnrqLocalRequestedAmount { get; set; }

    public bool FincnrqRequiresRebill { get; set; }

    public DateTime FincnrqRequestedAt { get; set; }

    public Guid? FincnrqRequestedBy { get; set; }

    public string? FincnrqReasonText { get; set; }

    public virtual ICollection<FinCreditNoteApproval> FinCreditNoteApprovals { get; set; } = new List<FinCreditNoteApproval>();

    public virtual ICollection<FinCreditNoteImpact> FinCreditNoteImpacts { get; set; } = new List<FinCreditNoteImpact>();

    public virtual ICollection<FinCreditNoteRequestLine> FinCreditNoteRequestLines { get; set; } = new List<FinCreditNoteRequestLine>();

    public virtual SysFinanceCreditNoteReason FincnrqReasonCodeNavigation { get; set; } = null!;

    public virtual CmpUser? FincnrqRequestedByNavigation { get; set; }

    public virtual FinDocument? FincnrqResultCreditDocument { get; set; }

    public virtual FinDocument FincnrqSourceDocument { get; set; } = null!;
}
