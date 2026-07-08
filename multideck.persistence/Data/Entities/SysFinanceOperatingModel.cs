using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceOperatingModel
{
    public string FinomCode { get; set; } = null!;

    public string FinomName { get; set; } = null!;

    public string? FinomDescription { get; set; }

    public int FinomSortOrder { get; set; }

    public bool FinomIsActive { get; set; }

    public virtual ICollection<FinOperatingModelSetting> FinOperatingModelSettings { get; set; } = new List<FinOperatingModelSetting>();

    public virtual ICollection<FinSetting> FinSettings { get; set; } = new List<FinSetting>();
}
