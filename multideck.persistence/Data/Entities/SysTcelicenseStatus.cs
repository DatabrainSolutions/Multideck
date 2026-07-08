using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcelicenseStatus
{
    public string TcelicenseStatusCode { get; set; } = null!;

    public string TcelicenseStatusName { get; set; } = null!;

    public string? TcelicenseStatusDescription { get; set; }

    public bool TcelicenseStatusIsUsable { get; set; }

    public bool TcelicenseStatusIsActive { get; set; }

    public int TcelicenseStatusSortOrder { get; set; }

    public virtual ICollection<TceLicense> TceLicenses { get; set; } = new List<TceLicense>();
}
