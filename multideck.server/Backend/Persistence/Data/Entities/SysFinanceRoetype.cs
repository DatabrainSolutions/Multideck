using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceRoetype
{
    public string FinroetCode { get; set; } = null!;

    public string FinroetName { get; set; } = null!;

    public string? FinroetDescription { get; set; }

    public bool FinroetIsOfficial { get; set; }

    public int FinroetSortOrder { get; set; }

    public bool FinroetIsActive { get; set; }

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual ICollection<FinExchangeRatePullRule> FinExchangeRatePullRules { get; set; } = new List<FinExchangeRatePullRule>();

    public virtual ICollection<FinExchangeRate> FinExchangeRates { get; set; } = new List<FinExchangeRate>();

    public virtual ICollection<FinJobRoeline> FinJobRoelines { get; set; } = new List<FinJobRoeline>();

    public virtual ICollection<FinVesselRoeline> FinVesselRoelines { get; set; } = new List<FinVesselRoeline>();
}
