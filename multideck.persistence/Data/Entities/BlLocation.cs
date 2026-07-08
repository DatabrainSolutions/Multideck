using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlLocation
{
    public Guid BllId { get; set; }

    public Guid BllBlId { get; set; }

    public string BllRole { get; set; } = null!;

    public Guid? BllLocationId { get; set; }

    public string? BllUnlocode { get; set; }

    public string BllNameSnapshot { get; set; } = null!;

    public string? BllCountryCodeSnapshot { get; set; }

    public string? BllAddressSnapshot { get; set; }

    public int BllSequence { get; set; }

    public string BllRawSnapshot { get; set; } = null!;

    public virtual BlHeader BllBl { get; set; } = null!;

    public virtual SysBllocationRole BllRoleNavigation { get; set; } = null!;
}
