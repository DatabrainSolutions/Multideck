using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditNoteLink
{
    public Guid FincreditLinkId { get; set; }

    public Guid FincreditLinkCreditDocumentId { get; set; }

    public Guid FincreditLinkOriginalDocumentId { get; set; }

    public Guid? FincreditLinkCreditDocumentLineId { get; set; }

    public Guid? FincreditLinkOriginalDocumentLineId { get; set; }

    public string? FincreditLinkReasonCode { get; set; }

    public decimal FincreditLinkCreditAmount { get; set; }

    public decimal FincreditLinkLocalCreditAmount { get; set; }

    public DateTime FincreditLinkCreatedAt { get; set; }

    public virtual FinDocument FincreditLinkCreditDocument { get; set; } = null!;

    public virtual FinDocumentLine? FincreditLinkCreditDocumentLine { get; set; }

    public virtual FinDocument FincreditLinkOriginalDocument { get; set; } = null!;

    public virtual FinDocumentLine? FincreditLinkOriginalDocumentLine { get; set; }

    public virtual SysFinanceCreditNoteReason? FincreditLinkReasonCodeNavigation { get; set; }
}
