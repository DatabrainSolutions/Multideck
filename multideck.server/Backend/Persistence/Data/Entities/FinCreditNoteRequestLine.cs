using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditNoteRequestLine
{
    public Guid FincnrqlId { get; set; }

    public Guid FincnrqlRequestId { get; set; }

    public Guid? FincnrqlSourceDocumentLineId { get; set; }

    public Guid? FincnrqlChargeInId { get; set; }

    public Guid? FincnrqlChargeOutId { get; set; }

    public decimal FincnrqlCreditAmount { get; set; }

    public decimal FincnrqlLocalCreditAmount { get; set; }

    public string? FincnrqlDescription { get; set; }

    public virtual JobCostingChargesIn? FincnrqlChargeIn { get; set; }

    public virtual JobCostingChargesOut? FincnrqlChargeOut { get; set; }

    public virtual FinCreditNoteRequest FincnrqlRequest { get; set; } = null!;

    public virtual FinDocumentLine? FincnrqlSourceDocumentLine { get; set; }
}
