using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsPackageLevel
{
    public string CplCode { get; set; } = null!;

    public string CplName { get; set; } = null!;

    public string? CplDescription { get; set; }

    public int CplSortOrder { get; set; }

    public bool CplIsActive { get; set; }

    public DateTime CplCreatedAt { get; set; }

    public virtual ICollection<CdsPackage> CdsPackages { get; set; } = new List<CdsPackage>();
}
