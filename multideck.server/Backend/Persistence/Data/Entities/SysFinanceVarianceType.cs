using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceVarianceType
{
    public string FinvartCode { get; set; } = null!;

    public string FinvartName { get; set; } = null!;

    public string? FinvartDescription { get; set; }

    public int FinvartSortOrder { get; set; }

    public bool FinvartIsActive { get; set; }

    public virtual ICollection<FinVarianceCase> FinVarianceCases { get; set; } = new List<FinVarianceCase>();

    public virtual ICollection<FinVarianceTolerance> FinVarianceTolerances { get; set; } = new List<FinVarianceTolerance>();
}
