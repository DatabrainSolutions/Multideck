using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysBlsecurityStatus
{
    public string BlsstCode { get; set; } = null!;

    public string BlsstName { get; set; } = null!;

    public bool BlsstIsValidForRelease { get; set; }

    public bool BlsstIsFinal { get; set; }

    public int BlsstSortOrder { get; set; }

    public bool BlsstIsActive { get; set; }

    public DateTime BlsstCreatedAt { get; set; }

    public virtual ICollection<BlSecurityControl> BlSecurityControls { get; set; } = new List<BlSecurityControl>();
}
