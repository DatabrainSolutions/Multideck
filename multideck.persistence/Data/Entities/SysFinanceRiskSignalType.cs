using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceRiskSignalType
{
    public string FinrskCode { get; set; } = null!;

    public string FinrskName { get; set; } = null!;

    public string? FinrskDescription { get; set; }

    public int FinrskSortOrder { get; set; }

    public bool FinrskIsActive { get; set; }

    public virtual ICollection<FinDisruptionRiskCase> FinDisruptionRiskCases { get; set; } = new List<FinDisruptionRiskCase>();
}
