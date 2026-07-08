using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmreserveType
{
    public string ClmreserveTypeCode { get; set; } = null!;

    public string ClmreserveTypeName { get; set; } = null!;

    public string? ClmreserveTypeDescription { get; set; }

    public bool ClmreserveTypeIsActive { get; set; }

    public int ClmreserveTypeSortOrder { get; set; }

    public virtual ICollection<ClmClaimReserf> ClmClaimReserves { get; set; } = new List<ClmClaimReserf>();
}
