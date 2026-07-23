using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocUserEffectivePreference
{
    public Guid? UserId { get; set; }

    public Guid? CompanyId { get; set; }

    public string? LocaleCode { get; set; }

    public string? TimeZoneCode { get; set; }

    public string? DateFormatCode { get; set; }

    public string? TimeFormatCode { get; set; }

    public string? NumberFormatCode { get; set; }

    public string? MeasurementSystemCode { get; set; }

    public string? PaperSizeCode { get; set; }

    public string? WeekStartCode { get; set; }

    public string? CurrencyCode { get; set; }

    public string? DisplayTimeZoneModeCode { get; set; }
}
