using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobRoesummary
{
    public Guid? FinjobRoeId { get; set; }

    public Guid? FinjobRoeJobId { get; set; }

    public string? FinjobRoeStatusCode { get; set; }

    public DateOnly? FinjobRoeEffectiveDate { get; set; }

    public string? FinjobRoeUsageTypeCode { get; set; }

    public int? FinjobRoeLineCount { get; set; }

    public int? FinjobRoeVesselRoesetCount { get; set; }
}
