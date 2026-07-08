using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocProfileSummary
{
    public Guid? LocprofileId { get; set; }

    public Guid? CompanyId { get; set; }

    public string? LocprofileCode { get; set; }

    public string? LocprofileName { get; set; }

    public string? LocprofileLocaleCode { get; set; }

    public string? LoclocaleName { get; set; }

    public string? LocprofileTimeZoneCode { get; set; }

    public string? LocprofileDateFormatCode { get; set; }

    public string? LocdateFormatExample { get; set; }

    public string? LocprofileTimeFormatCode { get; set; }

    public string? LoctimeFormatExample { get; set; }

    public string? LocprofileNumberFormatCode { get; set; }

    public string? LocnumberFormatExample { get; set; }

    public string? LocprofileMeasurementSystemCode { get; set; }

    public string? LocprofilePaperSizeCode { get; set; }

    public string? LocprofileWeekStartCode { get; set; }

    public string? LocprofileDisplayTimeZoneModeCode { get; set; }

    public string? LocprofileCurrencyCode { get; set; }

    public bool? LocprofileIsDefault { get; set; }

    public bool? LocprofileIsActive { get; set; }
}
