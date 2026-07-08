using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinWipaccrualSummary
{
    public string? FinwaTypeCode { get; set; }

    public Guid? FinwaSourceId { get; set; }

    public Guid? FinwaJobId { get; set; }

    public Guid? FinwaPeriodId { get; set; }

    public string? FinwaStatusCode { get; set; }

    public DateOnly? FinwaAccountingDate { get; set; }

    public string? FinwaCurrencyCodeSnapshot { get; set; }

    public decimal? FinwaAmount { get; set; }

    public decimal? FinwaLocalAmount { get; set; }
}
