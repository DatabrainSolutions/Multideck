using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocRecordDateTimeContextSummary
{
    public Guid? LocdtcontextId { get; set; }

    public string? LocdtcontextSourceTable { get; set; }

    public Guid? LocdtcontextSourceRecordId { get; set; }

    public string? LocdtcontextSourceField { get; set; }

    public DateTime? LocdtcontextUtcvalue { get; set; }

    public DateTime? LocdtcontextLocalDateTime { get; set; }

    public DateOnly? LocdtcontextLocalDate { get; set; }

    public TimeOnly? LocdtcontextLocalTime { get; set; }

    public string? LocdtcontextTimeZoneCode { get; set; }

    public int? LocdtcontextUtcoffsetMinutes { get; set; }

    public string? LocdtcontextSourceLocaleCode { get; set; }

    public string? LocdtcontextSourceText { get; set; }

    public decimal? LocdtcontextConfidence { get; set; }

    public bool? LocdtcontextIsCurrent { get; set; }

    public DateTime? LocdtcontextCreatedAt { get; set; }

    public string? LocdtruleBusinessObjectCode { get; set; }

    public string? LocdtruleAmbiguityGroupCode { get; set; }
}
