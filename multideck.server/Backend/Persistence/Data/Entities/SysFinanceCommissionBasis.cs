using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceCommissionBasis
{
    public string FincombCode { get; set; } = null!;

    public string FincombName { get; set; } = null!;

    public string? FincombDescription { get; set; }

    public int FincombSortOrder { get; set; }

    public bool FincombIsActive { get; set; }

    public virtual ICollection<FinCommissionScheme> FinCommissionSchemes { get; set; } = new List<FinCommissionScheme>();
}
