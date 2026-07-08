using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobRoeline
{
    public Guid FinjobRoelineId { get; set; }

    public Guid FinjobRoelineSetId { get; set; }

    public string FinjobRoelineFromCurrencyCode { get; set; } = null!;

    public string FinjobRoelineToCurrencyCode { get; set; } = null!;

    public string FinjobRoelineRoetypeCode { get; set; } = null!;

    public DateOnly FinjobRoelineRateDate { get; set; }

    public decimal FinjobRoelineRate { get; set; }

    public Guid? FinjobRoelineProviderRateId { get; set; }

    public bool FinjobRoelineIsDefault { get; set; }

    public string? FinjobRoelineNotes { get; set; }

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual FinExchangeRate? FinjobRoelineProviderRate { get; set; }

    public virtual SysFinanceRoetype FinjobRoelineRoetypeCodeNavigation { get; set; } = null!;

    public virtual FinJobRoeset FinjobRoelineSet { get; set; } = null!;
}
