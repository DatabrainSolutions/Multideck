using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceVarianceStatus
{
    public string FinvarstCode { get; set; } = null!;

    public string FinvarstName { get; set; } = null!;

    public string? FinvarstDescription { get; set; }

    public bool FinvarstIsFinal { get; set; }

    public int FinvarstSortOrder { get; set; }

    public bool FinvarstIsActive { get; set; }

    public virtual ICollection<FinVarianceCase> FinVarianceCases { get; set; } = new List<FinVarianceCase>();
}
