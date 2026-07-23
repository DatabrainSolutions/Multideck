using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcelicenseType
{
    public string TcelicenseTypeCode { get; set; } = null!;

    public string TcelicenseTypeName { get; set; } = null!;

    public string? TcelicenseTypeDescription { get; set; }

    public bool TcelicenseTypeIsActive { get; set; }

    public int TcelicenseTypeSortOrder { get; set; }

    public virtual ICollection<TceLicense> TceLicenses { get; set; } = new List<TceLicense>();
}
