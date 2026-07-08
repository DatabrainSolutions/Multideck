using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmapprovalType
{
    public string ClmapprovalTypeCode { get; set; } = null!;

    public string ClmapprovalTypeName { get; set; } = null!;

    public string? ClmapprovalTypeDescription { get; set; }

    public bool ClmapprovalTypeIsActive { get; set; }

    public int ClmapprovalTypeSortOrder { get; set; }

    public virtual ICollection<ClmClaimApproval> ClmClaimApprovals { get; set; } = new List<ClmClaimApproval>();
}
