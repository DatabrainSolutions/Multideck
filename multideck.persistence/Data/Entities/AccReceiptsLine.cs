using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccReceiptsLine
{
    public Guid AccReceiptLineId { get; set; }

    public Guid? AccReceiptLineInvoice { get; set; }

    public decimal? AccReceiptLineAmount { get; set; }

    public bool? AccReceiptLineFullInvoice { get; set; }

    public string? AccReceiptLineNotes { get; set; }

    public Guid? AccReceiptLineHeaderId { get; set; }

    public Guid? AccReceiptLineChargeId { get; set; }

    public virtual JobCostingChargesOut? AccReceiptLineCharge { get; set; }

    public virtual AccReceiptsHeader? AccReceiptLineHeader { get; set; }

    public virtual AccArtransHeader? AccReceiptLineInvoiceNavigation { get; set; }
}
