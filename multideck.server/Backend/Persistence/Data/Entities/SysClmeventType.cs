using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmeventType
{
    public string ClmeventTypeCode { get; set; } = null!;

    public string ClmeventTypeName { get; set; } = null!;

    public string? ClmeventTypeDescription { get; set; }

    public bool ClmeventTypeIsActive { get; set; }

    public int ClmeventTypeSortOrder { get; set; }

    public virtual ICollection<ClmClaimEvent> ClmClaimEvents { get; set; } = new List<ClmClaimEvent>();
}
