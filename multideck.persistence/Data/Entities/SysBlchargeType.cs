using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysBlchargeType
{
    public string BlctCode { get; set; } = null!;

    public string BlctName { get; set; } = null!;

    public string? BlctDescription { get; set; }

    public int BlctSortOrder { get; set; }

    public virtual ICollection<BlCharge> BlCharges { get; set; } = new List<BlCharge>();
}
