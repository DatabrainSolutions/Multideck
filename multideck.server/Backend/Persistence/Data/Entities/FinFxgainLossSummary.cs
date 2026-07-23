using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinFxgainLossSummary
{
    public string? FinfxeventTypeCode { get; set; }

    public Guid? FinfxeventJobId { get; set; }

    public Guid? FinfxeventDocumentId { get; set; }

    public Guid? FinfxeventPeriodId { get; set; }

    public string? FinfxeventFromCurrencyCode { get; set; }

    public string? FinfxeventToCurrencyCode { get; set; }

    public int? FinfxeventCount { get; set; }

    public decimal? FinfxeventTotalGainLossAmount { get; set; }
}
