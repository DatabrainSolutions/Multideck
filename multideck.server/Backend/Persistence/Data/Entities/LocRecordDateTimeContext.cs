using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocRecordDateTimeContext
{
    public Guid LocdtcontextId { get; set; }

    public string LocdtcontextSourceTable { get; set; } = null!;

    public Guid LocdtcontextSourceRecordId { get; set; }

    public string LocdtcontextSourceField { get; set; } = null!;

    public DateTime LocdtcontextUtcvalue { get; set; }

    public DateOnly LocdtcontextLocalDate { get; set; }

    public TimeOnly LocdtcontextLocalTime { get; set; }

    public DateTime LocdtcontextLocalDateTime { get; set; }

    public string LocdtcontextTimeZoneCode { get; set; } = null!;

    public int LocdtcontextUtcoffsetMinutes { get; set; }

    public string? LocdtcontextSourceLocaleCode { get; set; }

    public string? LocdtcontextSourceText { get; set; }

    public decimal? LocdtcontextConfidence { get; set; }

    public bool LocdtcontextIsCurrent { get; set; }

    public DateTime LocdtcontextCreatedAt { get; set; }

    public Guid? LocdtcontextCreatedBy { get; set; }

    public virtual CmpUser? LocdtcontextCreatedByNavigation { get; set; }

    public virtual SysLoclocale? LocdtcontextSourceLocaleCodeNavigation { get; set; }

    public virtual SysLoctimeZone LocdtcontextTimeZoneCodeNavigation { get; set; } = null!;
}
