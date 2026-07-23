using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRptmetricCategory
{
    public string RptmetricCategoryCode { get; set; } = null!;

    public string RptmetricCategoryName { get; set; } = null!;

    public string? RptmetricCategoryDescription { get; set; }

    public bool RptmetricCategoryIsMvp { get; set; }

    public bool RptmetricCategoryIsActive { get; set; }

    public int RptmetricCategorySortOrder { get; set; }

    public virtual ICollection<RptKpi> RptKpis { get; set; } = new List<RptKpi>();
}
