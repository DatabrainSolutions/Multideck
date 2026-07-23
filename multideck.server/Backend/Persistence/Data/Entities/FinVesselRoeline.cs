using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinVesselRoeline
{
    public Guid FinvesselRoelineId { get; set; }

    public Guid FinvesselRoelineSetId { get; set; }

    public string FinvesselRoelineFromCurrencyCode { get; set; } = null!;

    public string FinvesselRoelineToCurrencyCode { get; set; } = null!;

    public string FinvesselRoelineRoetypeCode { get; set; } = null!;

    public DateOnly FinvesselRoelineRateDate { get; set; }

    public decimal FinvesselRoelineRate { get; set; }

    public Guid? FinvesselRoelineProviderRateId { get; set; }

    public string? FinvesselRoelineNotes { get; set; }

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual FinExchangeRate? FinvesselRoelineProviderRate { get; set; }

    public virtual SysFinanceRoetype FinvesselRoelineRoetypeCodeNavigation { get; set; } = null!;

    public virtual FinVesselRoeset FinvesselRoelineSet { get; set; } = null!;
}
