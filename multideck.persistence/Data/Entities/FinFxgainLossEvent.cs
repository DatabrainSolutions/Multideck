using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinFxgainLossEvent
{
    public Guid FinfxeventId { get; set; }

    public string FinfxeventTypeCode { get; set; } = null!;

    public Guid? FinfxeventJobId { get; set; }

    public Guid? FinfxeventDocumentId { get; set; }

    public Guid? FinfxeventCashAllocationId { get; set; }

    public Guid? FinfxeventRevaluationItemId { get; set; }

    public string FinfxeventFromCurrencyCode { get; set; } = null!;

    public string FinfxeventToCurrencyCode { get; set; } = null!;

    public decimal? FinfxeventOriginalRate { get; set; }

    public decimal? FinfxeventFinalRate { get; set; }

    public decimal FinfxeventSourceAmount { get; set; }

    public decimal FinfxeventGainLossAmount { get; set; }

    public Guid? FinfxeventPeriodId { get; set; }

    public DateTime FinfxeventCreatedAt { get; set; }

    public virtual FinCashAllocation? FinfxeventCashAllocation { get; set; }

    public virtual FinDocument? FinfxeventDocument { get; set; }

    public virtual JobHeader? FinfxeventJob { get; set; }

    public virtual FinPeriod? FinfxeventPeriod { get; set; }

    public virtual FinRevaluationItem? FinfxeventRevaluationItem { get; set; }

    public virtual SysFinanceFxgainLossType FinfxeventTypeCodeNavigation { get; set; } = null!;
}
