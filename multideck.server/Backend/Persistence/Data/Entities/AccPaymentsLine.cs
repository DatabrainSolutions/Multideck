using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccPaymentsLine
{
    public Guid AccPayLineId { get; set; }

    public Guid? AccPayLineHeaderId { get; set; }

    public Guid? AccPayLineChargeId { get; set; }

    public decimal? AccPayLineAmount { get; set; }

    public int? AccPayLineCurrency { get; set; }

    public decimal? AccPayLineRoe { get; set; }

    public Guid? AccPayLineSupplierInvoiceId { get; set; }

    public virtual JobCostingChargesIn? AccPayLineCharge { get; set; }

    public virtual AccPaymentsHeader? AccPayLineHeader { get; set; }
}
