using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlInsurance
{
    public Guid BlinsId { get; set; }

    public Guid BlinsBlId { get; set; }

    public bool BlinsInsuranceRequested { get; set; }

    public Guid? BlinsInsurerOrgId { get; set; }

    public string? BlinsInsurerNameSnapshot { get; set; }

    public string? BlinsPolicyNumber { get; set; }

    public decimal? BlinsCoverAmount { get; set; }

    public Guid? BlinsCurrencyId { get; set; }

    public string? BlinsCurrencyCodeSnapshot { get; set; }

    public string? BlinsCoverNotes { get; set; }

    public virtual BlHeader BlinsBl { get; set; } = null!;
}
