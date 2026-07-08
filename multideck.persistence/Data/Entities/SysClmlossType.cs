using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmlossType
{
    public string ClmlossTypeCode { get; set; } = null!;

    public string ClmlossTypeName { get; set; } = null!;

    public string? ClmlossTypeDescription { get; set; }

    public bool ClmlossTypeIsActive { get; set; }

    public int ClmlossTypeSortOrder { get; set; }

    public virtual ICollection<ClmClaimLine> ClmClaimLines { get; set; } = new List<ClmClaimLine>();
}
