using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAccountingEvent
{
    public Guid FinacctEventId { get; set; }

    public string FinacctEventEventTypeCode { get; set; } = null!;

    public string FinacctEventSourceTable { get; set; } = null!;

    public Guid FinacctEventSourceId { get; set; }

    public Guid? FinacctEventJobId { get; set; }

    public Guid? FinacctEventPeriodId { get; set; }

    public DateOnly FinacctEventAccountingDate { get; set; }

    public decimal FinacctEventAmount { get; set; }

    public decimal FinacctEventLocalAmount { get; set; }

    public string FinacctEventCurrencyCodeSnapshot { get; set; } = null!;

    public string? FinacctEventExplanation { get; set; }

    public DateTime FinacctEventCreatedAt { get; set; }

    public virtual JobHeader? FinacctEventJob { get; set; }

    public virtual FinPeriod? FinacctEventPeriod { get; set; }
}
