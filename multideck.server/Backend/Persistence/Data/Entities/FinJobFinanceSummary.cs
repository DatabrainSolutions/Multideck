using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobFinanceSummary
{
    public Guid? JobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? JobCustomer { get; set; }

    public string? JobCustomerName { get; set; }

    public decimal? FinjobLocalRevenue { get; set; }

    public decimal? FinjobLocalCost { get; set; }

    public decimal? FinjobLocalWip { get; set; }

    public decimal? FinjobLocalAccrual { get; set; }

    public decimal? FinjobLocalMargin { get; set; }
}
