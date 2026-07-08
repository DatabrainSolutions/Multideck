using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCutoffRunSummary
{
    public Guid? FincutoffId { get; set; }

    public string? FincutoffRunTypeCode { get; set; }

    public string? FincutoffStatusCode { get; set; }

    public Guid? FincutoffPeriodId { get; set; }

    public Guid? FincutoffLegalEntityId { get; set; }

    public Guid? FincutoffOrgOfficeId { get; set; }

    public DateOnly? FincutoffAccountingDateFrom { get; set; }

    public DateOnly? FincutoffAccountingDateTo { get; set; }

    public int? FincutoffItemCount { get; set; }

    public decimal? FincutoffLocalWipamount { get; set; }

    public decimal? FincutoffLocalAccrualAmount { get; set; }

    public int? FincutoffExceptionItemCount { get; set; }
}
