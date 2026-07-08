using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinTaxReturnLine
{
    public Guid FintaxLineId { get; set; }

    public Guid FintaxLineReturnId { get; set; }

    public string FintaxLineBoxCode { get; set; } = null!;

    public string? FintaxLineDescription { get; set; }

    public decimal FintaxLineAmount { get; set; }

    public string FintaxLineSourceJson { get; set; } = null!;

    public virtual FinTaxReturn FintaxLineReturn { get; set; } = null!;
}
